import type OpenAI from "openai";
import type { TechStack, BrightApiContext } from "../types.js";
import type { ChatCompletionTool } from "openai/resources/chat/completions.mjs";
import { chatWithTools, type ToolHandler } from "../inference.js";
import {
  codebaseTools,
  createToolHandler,
  webSearchTools,
  createWebSearchHandler,
  runCommandOnHostTool,
  runCommandInDockerTool,
  probeUrlTool,
  execInDocker,
} from "../tools.js";
import { listAuthObjects, getAuthObject } from "../bright-api.js";
import { formatTechStack, extractJson, runShellCommand, toErrorMessage, saveProbeBody, stripHtmlForAnalysis, extractSetCookies, FETCH_TIMEOUT_SHORT, FETCH_TIMEOUT_MEDIUM, FETCH_TIMEOUT_DEFAULT, FETCH_TIMEOUT_LONG, FETCH_TIMEOUT_EXTENDED } from "../utils.js";
import { detectAuthPrompt, configureAuthPrompt, seedUserPrompt, repairBrokenLoginPrompt } from "../prompts/auth.js";

const CONTENT_TYPE_MAP: Record<string, string> = {
  json: "application/json",
  form: "application/x-www-form-urlencoded",
  xml: "application/xml",
};

export interface AuthResult {
  /** Single auth object ID for the whole app, or undefined if no auth. */
  authObjectId: string | undefined;
  /** True if auth was successfully configured. */
  hasAuth: boolean;
  /** True if auth was detected as required but could not be configured. */
  authFailed: boolean;
  /** Registration info for re-registering the test user after app restarts. */
  registration?: {
    baseUrl: string;
    endpoint: string;
    method: string;
    body: string;
    contentType: string;
  };
  /** CLI commands that created/seeded the test user (docker exec, rails runner, etc.).
   *  Replayed after restart to ensure the user exists without re-running the LLM. */
  seedCommands?: SeedCommand[];
  /** When set, auth failed due to an infrastructure issue (e.g. missing env var,
   *  app returning HTML instead of JSON). The orchestrator should repair
   *  infrastructure, restart the app, and retry auth. */
  infraRepairHint?: string;
}

export interface SeedCommand {
  /** "host" for run_command_on_host, "docker" for run_command_in_docker */
  type: "host" | "docker";
  command: string;
  /** Container name, only for type === "docker" */
  container?: string;
}

export interface AuthTestStageDetail {
  stage: string;
  status: string;
  name?: string;
  message?: string;
  request?: {
    method: string;
    url: string;
    body?: string;
  };
  response?: {
    status: number;
    bodyPreview: string;
    setCookie?: string[];
    contentType?: string;
    /** Full error body saved to this file — use read_file to inspect */
    bodyFile?: string;
  };
}

export interface AuthTestResult {
  passed: boolean;
  summary: string;
  stages?: AuthTestStageDetail[];
}

/**
 * Detects the application's authentication mechanism by analyzing source code,
 * then creates a Bright auth object using the LLM + Bright REST API.
 *
 * Phase 1 (code analysis): LLM reads the codebase to detect auth type,
 *   credentials, registration flow, etc.
 * Phase 2 (local registration): Directly registers a test user if needed.
 * Phase 3 (LLM-driven auth setup): LLM uses custom Bright REST tools
 *   (create_auth, edit_auth, getAuth, listAuths) to create and iteratively
 *   fix the auth object, seeing full test feedback at each step.
 */
export async function detectAndConfigureAuth(
  llm: OpenAI,
  repoPath: string,
  techStack: TechStack,
  projectId: string,
  baseUrl: string,
  repeaterId: string,
  api: BrightApiContext,
  model?: string,
  contextSummary?: string,
): Promise<AuthResult> {
  // Phase 1: Detect auth from source code
  const detection = await detectAuthFromCode(
    llm,
    repoPath,
    techStack,
    baseUrl,
    model,
    contextSummary,
  );

  if (!detection.requiresAuth) {
    console.log("[Auth] No auth required");
    return { authObjectId: undefined, hasAuth: false, authFailed: false };
  }

  console.log(
    `[Auth] Detected auth: ${detection.authType} — ${detection.notes}`,
  );
  console.log(
    `[Auth] loginEndpoint=${detection.loginEndpoint}, protectedEndpoint=${detection.protectedEndpointPath}`,
  );
  console.log(
    `[Auth] loginContentType=${detection.loginContentType}, tokenEmbedLocation=${detection.tokenEmbedLocation}`,
  );

  // Phase 2: Try quick HTTP registration if the detection found a registration endpoint
  let registrationOk = await registerUser(baseUrl, detection);

  // Phase 3: If no confirmed user, run the seed user sub-phase (dedicated LLM session)
  let seededCredentials: SeedUserResult | undefined;
  if (!registrationOk) {
    seededCredentials = await seedTestUser(llm, repoPath, baseUrl, detection, model);
    if (seededCredentials?.success) {
      registrationOk = true;
      // Update detection with the seeded credentials so configureAuth uses them
      detection.loginBody = JSON.stringify({
        login: seededCredentials.username,
        password: seededCredentials.password,
      });

      // If detection didn't find a loginEndpoint, try common patterns so the
      // sanity check and auth config have something to work with.
      if (!detection.loginEndpoint) {
        const discovered = await discoverLoginEndpoint(baseUrl);
        if (discovered) {
          detection.loginEndpoint = discovered;
          console.log(`[Auth] Discovered login endpoint: ${discovered}`);
        }
      }

      // Verify the seeded credentials actually work before burning LLM turns
      const credCheck = await verifySeededCredentials(baseUrl, seededCredentials, detection);
      if (!credCheck.valid) {
        console.warn(`[Auth:Seed] Credential verification failed: ${credCheck.reason}`);

        // If user exists but isn't activated, re-run seed LLM with activation focus
        if (credCheck.reason.startsWith("not_activated")) {
          console.log("[Auth:Seed] User not activated — re-running seed with activation hint");
          const activationResult = await seedTestUser(
            llm, repoPath, baseUrl, detection, model,
            `IMPORTANT: The test user "${seededCredentials.username}" was created but is NOT ACTIVATED. ` +
            `The login endpoint returned: "not_activated". You MUST activate/confirm the user's email before returning. ` +
            `Common methods: rails runner "User.find_by(email:'${seededCredentials.email ?? seededCredentials.username}')&.activate", ` +
            `Django: User.objects.filter(email='...').update(is_active=True), ` +
            `or update the database directly. Do NOT create a new user — just activate the existing one.`,
          );
          if (activationResult?.success) {
            // Re-verify after activation
            const recheck = await verifySeededCredentials(baseUrl, seededCredentials, detection);
            if (recheck.valid) {
              console.log("[Auth:Seed] Post-activation verification passed");
            } else {
              console.warn(`[Auth:Seed] Post-activation verification still failed: ${recheck.reason}`);
              registrationOk = false;
            }
          } else {
            console.warn("[Auth:Seed] Activation re-seed failed");
            registrationOk = false;
          }
        } else {
          console.warn("[Auth:Seed] The seed LLM may have changed the password — seeded password might not match");
          registrationOk = false;
        }
      } else {
        console.log("[Auth:Seed] Credential verification passed — login works");
      }
    }
  }

  // Phase 4: Let the LLM create + test + fix the auth object via custom tools
  //   Pre-probe the app to give the LLM real data instead of forcing it to guess
  const probeContext = await preProbeForAuth(baseUrl, detection);

  // Phase 4.5: Sanity-check the login endpoint before burning LLM turns
  let loginCheck = await preAuthLoginSanityCheck(baseUrl, detection);
  if (!loginCheck.functional) {
    // Login is broken (HTTP 5xx) — give the LLM a chance to fix the app
    console.warn("[Auth] Login endpoint broken — attempting repair...");
    const repaired = await repairBrokenLogin(
      llm,
      repoPath,
      baseUrl,
      loginCheck.diagnostic,
      model,
    );

    if (repaired) {
      // Re-run sanity check after repair
      loginCheck = await preAuthLoginSanityCheck(baseUrl, detection);
      if (!loginCheck.functional) {
        console.error("[Auth] Login still broken after repair attempt — aborting auth");
        return {
          authObjectId: undefined,
          hasAuth: false,
          authFailed: true,
          registration: undefined,
        };
      }
      console.log("[Auth] Login repaired successfully — proceeding with auth setup");
    } else {
      console.error("[Auth] Could not repair login endpoint — aborting auth");
      return {
        authObjectId: undefined,
        hasAuth: false,
        authFailed: true,
        registration: undefined,
      };
    }
  }

  const MAX_AUTH_ATTEMPTS = 3;
  let authObjectId: string | undefined;
  const allAttemptLogs: string[] = [];
  // Include login sanity diagnostics in the probe context for the LLM
  const fullProbeContext = loginCheck.diagnostic
    ? probeContext + "\n\n" + loginCheck.diagnostic
    : probeContext;

  let infraRepairHint: string | undefined;

  for (let attempt = 1; attempt <= MAX_AUTH_ATTEMPTS; attempt++) {
    // Build context from previous failures
    let attemptContext = fullProbeContext;
    if (allAttemptLogs.length > 0) {
      attemptContext += "\n\n## Previous attempt failures\n"
        + "Learn from these mistakes. Do NOT repeat the same configurations.\n\n"
        + allAttemptLogs.join("\n\n---\n\n");
    }

    console.log(`[Auth] Auth configuration attempt ${attempt}/${MAX_AUTH_ATTEMPTS}...`);
    const result = await createAuthViaMcp(
      llm,
      repoPath,
      detection,
      registrationOk,
      projectId,
      baseUrl,
      repeaterId,
      api,
      model,
      attemptContext,
    );

    if (result.authId) {
      authObjectId = result.authId;
      break;
    }

    // If the LLM requests infrastructure repair, break immediately —
    // retrying auth won't help until the app is fixed and restarted
    if (result.infraRepairHint) {
      infraRepairHint = result.infraRepairHint;
      console.log(`[Auth] Infrastructure repair requested — breaking out of auth loop`);
      break;
    }

    // Capture what was tried and what failed for the next attempt
    if (result.attemptLog.length > 0) {
      allAttemptLogs.push(`### Attempt ${attempt} failures:\n${result.attemptLog.join("\n")}`);
    }

    if (attempt < MAX_AUTH_ATTEMPTS) {
      console.log(`[Auth] Attempt ${attempt} failed — retrying with accumulated context...`);
    }
  }

  // Build registration info for re-use after app restarts
  const registration =
    detection.registerEndpoint && detection.registerBody
      ? {
          baseUrl,
          endpoint: detection.registerEndpoint,
          method: detection.registerMethod ?? "POST",
          body: detection.registerBody,
          contentType: detection.registerContentType ?? detection.loginContentType,
        }
      : undefined;

  // Collect seed commands from the seed user sub-phase for replay after restarts
  const seedCommands = (seededCredentials as (SeedUserResult & { seedCommands?: SeedCommand[] }) | undefined)?.seedCommands;

  if (authObjectId) {
    console.log(`[Auth] Auth configured successfully: ${authObjectId}`);
    return { authObjectId, hasAuth: true, authFailed: false, registration, seedCommands };
  }

  if (infraRepairHint) {
    console.error(`[Auth] Failed — infrastructure repair needed: ${infraRepairHint.slice(0, 200)}`);
    return {
      authObjectId: undefined,
      hasAuth: false,
      authFailed: true,
      registration,
      infraRepairHint,
    };
  }

  console.error("[Auth] Failed to configure auth");
  return {
    authObjectId: undefined,
    hasAuth: false,
    authFailed: true,
    registration,
  };
}

// ---------------------------------------------------------------------------
// Step 1: Detect auth mechanism from source code
// ---------------------------------------------------------------------------

interface AuthDetection {
  requiresAuth: boolean;
  authType: "jwt" | "session" | "api_key" | "basic" | "oauth" | "none";
  loginEndpoint: string | null;
  loginMethod: string | null;
  loginBody: string | null;
  loginContentType: "json" | "form" | "xml";
  tokenLocation: "body" | "header" | "cookie";
  tokenFieldPath: string | null;
  tokenEmbedLocation: "header" | "cookie" | "query";
  headerName: string | null;
  headerPrefix: string | null;
  cookieName: string | null;
  queryParamName: string | null;
  reauthIndicator: "status" | "redirect" | "body";
  reauthBodyPattern: string | null;
  protectedEndpointPath: string | null;
  registerEndpoint: string | null;
  registerMethod: string | null;
  registerBody: string | null;
  registerContentType: "json" | "form" | "xml" | null;
  // CSRF detection fields — reported by the detection LLM
  csrfRequired: boolean;
  csrfFieldName: string | null;
  csrfFormUrl: string | null;
  csrfDelivery: "form_body" | "header" | null;
  csrfExtractPattern: string | null;
  notes: string;
}

async function detectAuthFromCode(
  llm: OpenAI,
  repoPath: string,
  techStack: TechStack,
  baseUrl: string,
  model?: string,
  contextSummary?: string,
): Promise<AuthDetection> {
  const stackStr = formatTechStack(techStack);
  const codeHandler = createToolHandler(repoPath);

  // Give the detection LLM both codebase tools AND probe_url so it can
  // verify its conclusion against the live app instead of guessing.
  _probeCookieJar = {};
  const probeToolDef: ChatCompletionTool = {
    type: "function",
    function: {
      name: "probe_url",
      description:
        "Make an HTTP request to the RUNNING application and see the response (status, headers, body). Use this to verify auth requirements — e.g. GET a protected endpoint and check for 401/403/302/login_required.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full URL (e.g. http://localhost:3000/admin)" },
          method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"], description: "HTTP method. Default: GET" },
          headers: { type: "string", description: 'JSON headers, e.g. \'{"Accept":"application/json"}\'' },
          body: { type: "string", description: "Request body for POST/PUT" },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  };

  const messages = detectAuthPrompt(stackStr, baseUrl, contextSummary);

  const webHandler = createWebSearchHandler(repoPath);

  const response = await chatWithTools(
    llm,
    messages,
    [...codebaseTools, probeToolDef, ...webSearchTools],
    (name, args) => {
      if (name === "probe_url") return probeUrl(args);
      if (name === "search_web" || name === "fetch_url") return webHandler(name, args);
      return codeHandler(name, args);
    },
    model,
    40,
  );

  try {
    const parsed = JSON.parse(extractJson(response));
    return {
      requiresAuth: parsed.requiresAuth ?? true,
      authType: parsed.authType ?? "none",
      loginEndpoint: parsed.loginEndpoint ?? null,
      loginMethod: parsed.loginMethod ?? "POST",
      loginBody: parsed.loginBody ?? null,
      loginContentType: parsed.loginContentType ?? "json",
      tokenLocation: parsed.tokenLocation ?? "body",
      tokenFieldPath: parsed.tokenFieldPath ?? null,
      tokenEmbedLocation: parsed.tokenEmbedLocation ?? "header",
      headerName: parsed.headerName ?? "Authorization",
      headerPrefix: parsed.headerPrefix ?? "Bearer ",
      cookieName: parsed.cookieName ?? null,
      queryParamName: parsed.queryParamName ?? null,
      reauthIndicator: parsed.reauthIndicator ?? "status",
      reauthBodyPattern: parsed.reauthBodyPattern ?? null,
      protectedEndpointPath: parsed.protectedEndpointPath ?? null,
      registerEndpoint: parsed.registerEndpoint ?? null,
      registerMethod: parsed.registerMethod ?? "POST",
      registerBody: parsed.registerBody ?? null,
      registerContentType: parsed.registerContentType ?? null,
      csrfRequired: parsed.csrfRequired ?? false,
      csrfFieldName: parsed.csrfFieldName ?? null,
      csrfFormUrl: parsed.csrfFormUrl ?? null,
      csrfDelivery: parsed.csrfDelivery ?? null,
      csrfExtractPattern: parsed.csrfExtractPattern ?? null,
      notes: parsed.notes ?? "",
    };
  } catch {
    console.warn(
      "[Auth] Could not parse detection response — defaulting to requiresAuth:true:",
      response.slice(0, 300),
    );
    return {
      requiresAuth: true,
      authType: "session",
      loginEndpoint: null,
      loginMethod: null,
      loginBody: null,
      loginContentType: "json",
      tokenLocation: "body",
      tokenFieldPath: null,
      tokenEmbedLocation: "header",
      headerName: null,
      headerPrefix: null,
      cookieName: null,
      queryParamName: null,
      reauthIndicator: "status",
      reauthBodyPattern: null,
      protectedEndpointPath: null,
      registerEndpoint: null,
      registerMethod: null,
      registerBody: null,
      registerContentType: null,
      csrfRequired: false,
      csrfFieldName: null,
      csrfFormUrl: null,
      csrfDelivery: null,
      csrfExtractPattern: null,
      notes: "Detection parse failed — assuming auth required",
    };
  }
}

// ---------------------------------------------------------------------------
// Phase 3: LLM-driven auth configuration via custom Bright REST tools
// ---------------------------------------------------------------------------

/**
 * Create an auth object via the Bright REST API with all the tricky
 * boilerplate handled programmatically (redirect settings, reauthTriggers,
 * embedders, NexTemplate). The LLM only needs to choose the high-level params.
 */
async function createAuthViaRestApi(
  api: BrightApiContext,
  projectId: string,
  repeaterId: string,
  params: {
    authStyle: string;
    loginUrl: string;
    loginBody: string;
    loginContentType: string;
    testUrl: string;
    tokenFieldPath?: string;
    headerName?: string;
    headerValue?: string;
    csrfUrl?: string;
    csrfHeaderName?: string;
    csrfExtractPattern?: string;
    cookieUrl?: string;
    loginAccept?: string;
    reauthStrategy?: string;
    reauthBodyPattern?: string;
  },
): Promise<{ id?: string; error?: string }> {
  const { authStyle, loginUrl, loginBody, loginContentType, testUrl } = params;

  const contentType =
    loginContentType === "form"
      ? "application/x-www-form-urlencoded"
      : "application/json";
  const normalizedBody = normalizeBody(loginBody, loginContentType);

  // --- API key: simple header auth ---
  if (authStyle === "api_key") {
    const body = {
      name: "Engine Auth — api_key",
      projectId,
      type: "header",
      test: {
        repeaterId,
        request: { method: "GET", url: testUrl },
      },
      successResponseDetection: [{ type: "status", statuses: [200] }],
      reauthTriggers: [
        { type: "TRIGGER", location: "status", statuses: [401, 403] },
      ],
      config: {
        request: {
          url: testUrl,
          method: "GET",
          headers: [
            {
              name: params.headerName ?? "Authorization",
              value: params.headerValue ?? "",
              type: "clear_text",
            },
          ],
        },
      },
    };
    return postAuthObject(api, body);
  }

  // --- Session or JWT: multistep auth ---
  const isSession = authStyle === "session";

  // reauthTriggers — default to "both" for session (status OR redirect OR body), status for JWT
  const reauthStrat = params.reauthStrategy ?? (isSession ? "both" : "status");

  // For session auth: build a body trigger from the login path so that after
  // following redirects (where there's no Location header), we can still detect
  // an unauthenticated response by matching the login form's action attribute.
  let loginBodyTrigger: Record<string, unknown> | null = null;
  if (isSession) {
    try {
      const loginPath = new URL(loginUrl).pathname;
      const escaped = loginPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      loginBodyTrigger = {
        type: "TRIGGER",
        location: "body",
        patterns: [`action=["'][^"']*${escaped}["']`],
      };
    } catch { /* bad URL — skip body trigger */ }
  }

  let reauthTriggers: Record<string, unknown>[];
  if (reauthStrat === "body" && params.reauthBodyPattern) {
    reauthTriggers = [
      { type: "TRIGGER", location: "body", patterns: [params.reauthBodyPattern] },
    ];
  } else if (reauthStrat === "redirect") {
    reauthTriggers = [
      { type: "TRIGGER", location: "header", name: "Location", patterns: ["login|signin|sign_in|auth"] },
      ...(loginBodyTrigger ? [{ type: "OR" } as Record<string, unknown>, loginBodyTrigger] : []),
    ];
  } else if (reauthStrat === "both") {
    reauthTriggers = [
      { type: "TRIGGER", location: "status", statuses: [401, 403] },
      { type: "OR" },
      { type: "TRIGGER", location: "header", name: "Location", patterns: ["login|signin|sign_in|auth"] },
      ...(loginBodyTrigger ? [{ type: "OR" } as Record<string, unknown>, loginBodyTrigger] : []),
    ];
  } else {
    reauthTriggers = [
      { type: "TRIGGER", location: "status", statuses: [401, 403] },
    ];
  }

  // Embedders: none for session (Bright auto-replays cookies), bearer header for JWT
  const embedders: Record<string, unknown>[] = [];
  if (!isSession && params.tokenFieldPath) {
    const lastSegment = params.tokenFieldPath.includes(".")
      ? params.tokenFieldPath.split(".").pop()!
      : params.tokenFieldPath;
    const escaped = lastSegment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tokenRegex = `"${escaped}"\\s*:\\s*"([^"]*)"`;
    embedders.push({
      type: "header",
      name: "Authorization",
      template: `Bearer {{ auth_object.stages.login.response.body | match: /${tokenRegex}/ }}`,
      templateType: "clear_text",
      mergeStrategy: "replace",
    });
  }

  // For session auth: disable redirect following so we see raw 302 + Location header
  const redirectOpts = isSession
    ? { followRedirects: false, maxRedirects: 0, changeMethodOnRedirect: false }
    : {};

  // --- Auto-probe CSRF URL to detect the correct extract pattern ---
  // Must run BEFORE building the CSRF embedder below so the embedder uses
  // the auto-detected pattern instead of the generic default.
  if (params.csrfUrl && !params.csrfExtractPattern) {
    const detectedPattern = await autoProbeCsrf(params.csrfUrl);
    if (detectedPattern) {
      params.csrfExtractPattern = detectedPattern;
    }
  }

  // For session auth with CSRF: embed the CSRF token header on every scan
  // request. Without this, state-changing requests (POST/PUT/PATCH/DELETE)
  // are rejected with 403 "BAD CSRF" even though the session cookie is
  // valid. Gated on `params.csrfUrl` so apps that don't use CSRF (basic
  // session, JWT, header auth, etc.) skip this branch entirely — same
  // condition that controls whether a get_csrf step is added to the login
  // flow, so the two stay in sync.
  // Token is re-extracted from get_csrf on each re-auth, so the existing
  // 401/403 reauthTriggers refresh both cookie and token together.
  if (isSession && params.csrfUrl) {
    const headerName = params.csrfHeaderName || "X-CSRF-Token";
    const extractPattern = params.csrfExtractPattern || '"csrf"\\s*:\\s*"([^"]*)"';
    embedders.push({
      type: "header",
      name: headerName,
      template: `{{ auth_object.stages.get_csrf.response.body | match: /${extractPattern}/ }}`,
      templateType: "clear_text",
      mergeStrategy: "replace",
    });
  }

  const body: Record<string, unknown> = {
    name: `Engine Auth — ${authStyle}`,
    projectId,
    type: "multistep",
    test: {
      repeaterId,
      request: {
        method: "GET",
        url: testUrl,
        protocol: "http",
        bodyType: "clear_text",
        // For session auth: follow redirects so Bright sees the final page
        // (login page vs protected page) rather than a raw 302. This lets the
        // body reauthTrigger detect unauthenticated state, and lets Bright
        // compare validation (login page) vs authorization (protected page).
        // Login steps still use followRedirects:false to capture raw Set-Cookie.
        ...(isSession ? { followRedirects: true } : {}),
      },
    },
    successResponseDetection: [{ type: "status", statuses: [200] }],
    reauthTriggers,
    config: {
      multistep: {
        steps: buildLoginSteps({
          cookieUrl: params.cookieUrl,
          csrfUrl: params.csrfUrl,
          csrfHeaderName: params.csrfHeaderName,
          csrfExtractPattern: params.csrfExtractPattern,
          loginUrl,
          loginAccept: params.loginAccept,
          contentType,
          normalizedBody,
          isSession,
          redirectOpts,
        }),
        ...(embedders.length > 0 ? { embedders } : {}),
      },
    },
  };

  console.log(
    `[Auth] Creating ${authStyle} auth via REST API — login: ${loginUrl}, test: ${testUrl}${params.cookieUrl ? `, cookie: ${params.cookieUrl}` : ""}${params.csrfUrl ? `, csrf: ${params.csrfUrl}` : ""}${params.csrfExtractPattern ? `, csrfPattern: ${params.csrfExtractPattern}` : ""}`,
  );
  const steps = (body.config as Record<string, unknown>).multistep
    ? ((body.config as Record<string, Record<string, unknown>>).multistep.steps as Record<string, unknown>[])
    : undefined;
  if (steps) {
    console.log(`[Auth] Auth object steps: ${steps.map((s) => `${s.name}(${(s.request as Record<string, unknown>)?.method} ${(s.request as Record<string, unknown>)?.url})`).join(" → ")}`);
  }
  return postAuthObject(api, body);
}

/**
 * Build the multistep login steps array. When csrfUrl is provided, prepends
 * a GET step that fetches a CSRF token and injects it into the POST login step
 * via NexTemplate.
 */
function buildLoginSteps(opts: {
  cookieUrl?: string;
  csrfUrl?: string;
  csrfHeaderName?: string;
  csrfExtractPattern?: string;
  loginUrl: string;
  loginAccept?: string;
  contentType: string;
  normalizedBody: string;
  isSession: boolean;
  redirectOpts: Record<string, unknown>;
}): Record<string, unknown>[] {
  const steps: Record<string, unknown>[] = [];

  // Optional CSRF extraction step
  if (opts.csrfUrl) {
    steps.push({
      name: "get_csrf",
      request: {
        method: "GET",
        url: opts.csrfUrl,
        protocol: "http",
        headers: [
          {
            name: "Accept",
            value: "application/json",
            type: "clear_text",
            mergeStrategy: "replace",
          },
        ],
        bodyType: "clear_text",
        // Do NOT spread redirectOpts here — followRedirects:false is for the
        // login POST (to capture raw 302 + Set-Cookie). The CSRF GET should
        // follow redirects normally so the token fetch succeeds.
      },
      successResponseDetection: [{ type: "status", statuses: [200] }],
    });
  }

  // Optional cookie-establishing step: GET a page to init the session cookie
  // before the CSRF fetch. Needed by apps that require a pre-existing session
  // cookie before the CSRF endpoint will return a valid token.
  if (opts.cookieUrl) {
    steps.push({
      name: "init_session",
      request: {
        method: "GET",
        url: opts.cookieUrl,
        protocol: "http",
        bodyType: "clear_text",
      },
      successResponseDetection: [{ type: "status", statuses: [200] }],
    });
  }

  // Login step headers
  const loginHeaders: Record<string, unknown>[] = [
    {
      name: "Content-Type",
      value: opts.contentType,
      type: "clear_text",
      mergeStrategy: "replace",
    },
  ];

  // Optional Accept header — only when the caller explicitly requests it.
  // Not all apps support JSON responses; hardcoding it would break HTML-only
  // login flows (SAML, server-rendered apps, etc.).
  if (opts.loginAccept) {
    loginHeaders.push({
      name: "Accept",
      value: opts.loginAccept,
      type: "clear_text",
      mergeStrategy: "replace",
    });
  }

  // Inject CSRF token from previous step via NexTemplate
  if (opts.csrfUrl) {
    const headerName = opts.csrfHeaderName || "X-CSRF-Token";
    const extractPattern = opts.csrfExtractPattern || '"csrf"\\s*:\\s*"([^"]*)"';
    loginHeaders.push({
      name: headerName,
      value:
        `{{ auth_object.stages.get_csrf.response.body | match: /${extractPattern}/ }}`,
      type: "clear_text",
      mergeStrategy: "replace",
    });
  }

  steps.push({
    name: "login",
    request: {
      method: "POST",
      url: opts.loginUrl,
      protocol: "http",
      headers: loginHeaders,
      bodyType: "clear_text",
      body: opts.normalizedBody,
      ...opts.redirectOpts,
    },
    successResponseDetection: [
      {
        type: "status",
        statuses: opts.isSession ? [200, 201, 302] : [200, 201],
      },
    ],
  });

  return steps;
}

async function postAuthObject(
  api: BrightApiContext,
  body: Record<string, unknown>,
): Promise<{ id?: string; error?: string }> {
  try {
    const res = await fetch(`https://${api.brightHostname}/api/v3/auth-objects`, {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${api.brightToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { error: `HTTP ${res.status}: ${text.slice(0, 500)}` };
    }
    const data = (await res.json()) as { id?: string; authObjectId?: string };
    return { id: data.id ?? data.authObjectId };
  } catch (err) {
    return { error: `Request failed: ${err}` };
  }
}

async function createAuthViaMcp(
  llm: OpenAI,
  repoPath: string,
  detection: AuthDetection,
  registrationOk: boolean,
  projectId: string,
  baseUrl: string,
  repeaterId: string,
  api: BrightApiContext,
  model?: string,
  preProbeContext?: string,
): Promise<{ authId: string | undefined; attemptLog: string[]; infraRepairHint?: string }> {
  // Bright auth-object inspection tools (read-only, REST-backed)
  _probeCookieJar = {};
  const inspectionTools: ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "listAuths",
        description:
          "List Bright auth objects in the current project. Use to check what auth objects already exist before creating new ones, or to find the ID of an auth object you just created.",
        parameters: {
          type: "object",
          properties: {
            q: {
              type: "string",
              description: "(Optional) text search across auth object names",
            },
            limit: {
              type: "number",
              description: "(Optional) maximum results to return (default 25)",
            },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "getAuth",
        description:
          "Fetch the full configuration of a single Bright auth object by ID. Use this after listAuths to inspect how an existing auth object is configured.",
        parameters: {
          type: "object",
          properties: {
            authObjectId: {
              type: "string",
              description: "ID of the auth object to fetch",
            },
          },
          required: ["authObjectId"],
        },
      },
    },
  ];

  const inspectionHandler: ToolHandler = async (name, args) => {
    try {
      if (name === "listAuths") {
        const list = await listAuthObjects(api, {
          projectId,
          q: args.q as string | undefined,
          limit: (args.limit as number | undefined) ?? 25,
        });
        return JSON.stringify(list, null, 2);
      }
      if (name === "getAuth") {
        const obj = await getAuthObject(api, args.authObjectId as string);
        return JSON.stringify(obj, null, 2);
      }
      return `Unknown inspection tool: ${name}`;
    } catch (err) {
      return `Error from Bright API: ${toErrorMessage(err)}`;
    }
  };

  // Track what was tried and what failed for cross-attempt learning
  const attemptLog: string[] = [];

  // Custom tools that wrap our programmatic REST API calls
  const customTools: ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "create_auth",
        description: `Create a Bright auth object with all the correct settings pre-configured.
For session/cookie auth: disables redirect following, uses combined status+redirect reauthTrigger, no embedder needed.
For JWT auth: uses status 401/403 reauthTrigger, adds Bearer header embedder.
For API key: creates a static header auth object.
Supports CSRF token extraction: set csrfUrl to add a GET step that fetches the token before login.
For apps where no endpoint returns 401/403 (e.g. SPA apps, Discourse): use reauthStrategy='body' with reauthBodyPattern to detect unauthenticated responses by matching the response body.`,
        parameters: {
          type: "object",
          properties: {
            authStyle: {
              type: "string",
              enum: ["session", "jwt", "api_key"],
              description:
                "The authentication style: 'session' for cookie/session-based, 'jwt' for JSON Web Token, 'api_key' for static API key header",
            },
            loginUrl: {
              type: "string",
              description:
                "Full URL for the login endpoint (e.g. http://localhost:3000/session)",
            },
            loginBody: {
              type: "string",
              description:
                'Login request body. For form: \'login=user&password=pass\'. For JSON: \'{"login":"user","password":"pass"}\'',
            },
            loginContentType: {
              type: "string",
              enum: ["form", "json"],
              description:
                "Content type of the login body: 'form' for application/x-www-form-urlencoded, 'json' for application/json",
            },
            testUrl: {
              type: "string",
              description:
                "Full URL to a protected endpoint. Best: returns 401/403 without auth. If no endpoint returns 401/403, pick one that returns DIFFERENT content when authenticated (e.g. a .json endpoint with 'current_user' field). Prefer .json API endpoints over HTML/SPA routes.",
            },
            csrfUrl: {
              type: "string",
              description:
                "(Session auth) URL that returns a CSRF token in a **JSON endpoint** or **Rails meta tag**. The token is extracted via regex and sent as an HTTP header (X-CSRF-Token) on the login request. E.g. http://localhost:3000/session/csrf. ⚠️ IMPORTANT: This only works when CSRF is delivered via JSON or Rails meta tag and sent as a HEADER. If the app uses HTML form hidden inputs (Django csrfmiddlewaretoken, Laravel _token), you MUST use create_auth_raw instead — it lets you embed the CSRF token directly in the POST body via NexTemplate.",
            },
            cookieUrl: {
              type: "string",
              description:
                "(Session auth) URL to GET before the CSRF step to establish an initial session cookie. Some apps require a session cookie to exist before the CSRF endpoint returns a valid token. Typically the app's root URL (e.g. http://localhost:3000/). Only needed if the CSRF-then-login flow fails with session/token mismatch errors.",
            },
            loginAccept: {
              type: "string",
              description:
                "Accept header value for the login request. Set to 'application/json' when the login endpoint supports JSON responses — this prevents the server from trying to render HTML (which may crash on missing dependencies like ImageMagick). Leave unset for apps that only return HTML or when you're unsure. IMPORTANT: if login returns 500 with an HTML error page (Content-Type: text/html), try setting this to 'application/json'.",
            },
            csrfHeaderName: {
              type: "string",
              description:
                "(Session auth) HTTP header name to send the CSRF token in. Default: 'X-CSRF-Token'. Some frameworks use 'X-XSRF-Token' or 'csrf-token'.",
            },
            csrfExtractPattern: {
              type: "string",
              description:
                "(Session auth) Regex pattern to extract the CSRF token from the csrfUrl response body. Must have exactly one capture group for the token value. Default: '\"csrf\"\\s*:\\s*\"([^\"]*)\"' which matches JSON like {\"csrf\":\"token\"}. If the CSRF endpoint returns a different format, probe it first and set a matching pattern. Examples: '\"token\"\\s*:\\s*\"([^\"]*)\"' for {\"token\":\"...\"}, 'content=\"([^\"]*)\"' for HTML meta tag.",
            },
            reauthStrategy: {
              type: "string",
              enum: ["status", "redirect", "both", "body"],
              description:
                "How to detect expired auth. 'status' = 401/403 codes (APIs), 'redirect' = Location header containing 'login' (server-rendered), 'both' = status OR redirect (default for session), 'body' = match a regex pattern in the response body (for apps that always return 200). When 'body', set reauthBodyPattern. Use probe_url to check what the app returns without auth to decide.",
            },
            reauthBodyPattern: {
              type: "string",
              description:
                "(When reauthStrategy='body') A regex pattern that matches the UNAUTHENTICATED response body. When the test URL's body matches this, Bright re-authenticates. E.g. 'login_required|current_user.*null' or '\"is_admin\"\\s*:\\s*false'. First probe the testUrl WITHOUT auth to see what the unauthenticated body looks like, then pick a pattern that matches it but NOT the authenticated response.",
            },
            tokenFieldPath: {
              type: "string",
              description:
                "(JWT only) Dot-path to the token field in the login response body (e.g. 'token', 'data.accessToken')",
            },
            headerName: {
              type: "string",
              description:
                "(API key only) Header name for the API key (e.g. 'Authorization', 'X-API-Key')",
            },
            headerValue: {
              type: "string",
              description:
                "(API key only) Header value (e.g. 'Bearer sk-xxx', 'my-api-key-123')",
            },
          },
          required: [
            "authStyle",
            "loginUrl",
            "loginBody",
            "loginContentType",
            "testUrl",
          ],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_auth_raw",
        description: `Create a Bright auth object with FULL control over the multistep configuration.
Use this when the simplified create_auth tool cannot express the auth flow. REQUIRED for:
1. **HTML form CSRF** (Django, Laravel, etc.) — the CSRF token is a hidden input in the form and must go in the POST body, not a header.
2. **OAuth2 PKCE / authorization code** — multi-step flows with token exchange.
3. **Any flow where create_auth keeps failing** — gives you full control.

You define the exact steps array, embedders, reauthTriggers, and test request. Steps execute in order. Each step can reference previous step responses via NexTemplate expressions:
- Extract from response body: {{ auth_object.stages.<step_name>.response.body | match: /<regex_with_capture_group>/ }}
- Extract from response header: {{ auth_object.stages.<step_name>.response.headers.Location | match: /code=([^&]+)/ }}

Example — Django CSRF (csrfmiddlewaretoken in form body):
  steps: [
    { name: "get_csrf", request: { method: "GET", url: "http://localhost:8080/login", protocol: "http" }, successResponseDetection: [{ type: "status", statuses: [200] }] },
    { name: "login", request: { method: "POST", url: "http://localhost:8080/login", protocol: "http", headers: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }], body: "csrfmiddlewaretoken={{ auth_object.stages.get_csrf.response.body | match: /csrfmiddlewaretoken\\"\\s+value=\\"([^\\"]+)\\"/ }}&username=bright_test&password=BrightTest123%21", followRedirects: false, maxRedirects: 0 }, successResponseDetection: [{ type: "status", statuses: [200, 302] }] }
  ]
  reauthTriggers: [{ type: "TRIGGER", location: "status", statuses: [401, 403] }, { type: "OR" }, { type: "TRIGGER", location: "header", name: "Location", patterns: ["login"] }]
  Key: CSRF token goes IN the body via NexTemplate. URL-encode special chars in password (! → %21).

Example — OAuth2 PKCE flow:
  steps: [
    { name: "login", request: { method: "POST", url: "http://localhost/login", body: '{"username":"...","password":"..."}', headers: [{ name: "Content-Type", value: "application/json" }], protocol: "http" }, successResponseDetection: [{ type: "status", statuses: [200] }] },
    { name: "authorize", request: { method: "GET", url: "http://localhost/authorize?client_id=my-app&response_type=code&code_challenge=...&code_challenge_method=S256&redirect_uri=http://localhost/callback&scope=offline_access", protocol: "http", followRedirects: false }, successResponseDetection: [{ type: "status", statuses: [302] }] },
    { name: "token", request: { method: "POST", url: "http://localhost/token", body: "grant_type=authorization_code&code={{ auth_object.stages.authorize.response.headers.Location | match: /code=([^&]+)/ }}&code_verifier=...&redirect_uri=http://localhost/callback&client_id=my-app", headers: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }], protocol: "http" }, successResponseDetection: [{ type: "status", statuses: [200] }] }
  ]
  embedders: [{ type: "header", name: "Authorization", template: "Bearer {{ auth_object.stages.token.response.body | match: /"access_token"\\s*:\\s*"([^"]*)"/ }}", mergeStrategy: "replace" }]`,
        parameters: {
          type: "object",
          properties: {
            steps: {
              type: "string",
              description: `JSON array of multistep login steps. Each step: { name: string, request: { method, url, protocol: "http", headers?: [{name, value}], body?: string, bodyType?: "clear_text", followRedirects?: boolean, maxRedirects?: number, changeMethodOnRedirect?: boolean }, successResponseDetection?: [{type: "status", statuses: [200]}] }. Steps execute in order. Use NexTemplate to reference prior step responses.`,
            },
            embedders: {
              type: "string",
              description: `JSON array of embedders that inject tokens into scan requests. Each: { type: "header", name: "Authorization", template: "Bearer {{ auth_object.stages.<step_name>.response.body | match: /<regex>/ }}", mergeStrategy: "replace" }. For cookie/session auth (no explicit token), omit or pass empty array — Bright auto-replays cookies.`,
            },
            testUrl: {
              type: "string",
              description: "Full URL to a protected endpoint for session validation. Should return different responses for authenticated vs unauthenticated requests.",
            },
            testMethod: {
              type: "string",
              enum: ["GET", "POST", "PUT", "DELETE"],
              description: "HTTP method for the test request. Default: GET",
            },
            testFollowRedirects: {
              type: "boolean",
              description: "Whether the test request should follow HTTP redirects. Default: false. Set to TRUE when your reauthTriggers use body/dom patterns AND the app redirects unauthenticated requests (302 → login page) — without this the test sees only the raw 302 body which won't match. Keep FALSE when reauthTriggers check status codes or Location headers — following would hide the 302 you're trying to detect.",
            },
            testMaxRedirects: {
              type: "number",
              description: "Maximum redirects the test request will follow. Only relevant when testFollowRedirects is true. Default: 5.",
            },
            reauthTriggers: {
              type: "string",
              description: `JSON array of reauth triggers. Default: [{"type":"TRIGGER","location":"status","statuses":[401,403]}]. For redirect-based: [{"type":"TRIGGER","location":"header","name":"Location","patterns":["login"]}]. Can combine with OR: [..., {"type":"OR"}, ...].`,
            },
            successResponseDetection: {
              type: "string",
              description: `JSON array of success detection rules for the overall auth object (applied to the login response). Default: [{"type":"status","statuses":[200]}].`,
            },
          },
          required: ["steps", "testUrl"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "test_auth_object",
        description:
          "Test a Bright auth object. Runs the full login flow and returns detailed stage-by-stage results including HTTP status codes, response body previews, Set-Cookie headers, and request details for each stage (validation, authentication, authorization). Use the response body previews to diagnose issues — e.g. if the login response contains HTML error pages instead of JSON, the application may need configuration fixes.",
        parameters: {
          type: "object",
          properties: {
            authObjectId: {
              type: "string",
              description: "The auth object ID to test",
            },
          },
          required: ["authObjectId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "delete_auth_object",
        description:
          "Delete a Bright auth object that failed testing so you can recreate it with different settings.",
        parameters: {
          type: "object",
          properties: {
            authObjectId: {
              type: "string",
              description: "The auth object ID to delete",
            },
          },
          required: ["authObjectId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "probe_url",
        description:
          "Make an HTTP request to the running application and return the actual response (status, headers, body preview). Cookies from set-cookie responses are automatically stored and sent on subsequent requests (browser-like). Use this BEFORE creating an auth object to: (1) find the right test URL by checking which endpoints return 401/403 without auth, (2) check if CSRF tokens are needed (look for csrf meta tags or /session/csrf endpoint), (3) verify login endpoint exists (non-404 response). For full login testing, use create_auth + test_auth_object instead.",
        parameters: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description:
                "Full URL to probe (e.g. http://localhost:3000/admin/plugins.json)",
            },
            method: {
              type: "string",
              enum: ["GET", "POST", "PUT", "DELETE"],
              description: "HTTP method. Default: GET",
            },
            headers: {
              type: "string",
              description:
                'JSON object of headers to send, e.g. \'{"Content-Type":"application/json","X-CSRF-Token":"abc"}\'',
            },
            body: {
              type: "string",
              description: "Request body for POST/PUT",
            },
          },
          required: ["url"],
          additionalProperties: false,
        },
      },
    },
    runCommandOnHostTool,
    runCommandInDockerTool,
  ];

  let lastCreateArgs: Record<string, unknown> = {};

  const customHandler: ToolHandler = async (name, args) => {
    if (name === "create_auth") {
      lastCreateArgs = { ...args };
      const result = await createAuthViaRestApi(
        api,
        projectId,
        repeaterId,
        {
          authStyle: String(args.authStyle),
          loginUrl: String(args.loginUrl),
          loginBody: String(args.loginBody),
          loginContentType: String(args.loginContentType),
          testUrl: String(args.testUrl),
          csrfUrl: args.csrfUrl ? String(args.csrfUrl) : undefined,
          csrfHeaderName: args.csrfHeaderName
            ? String(args.csrfHeaderName)
            : undefined,
          csrfExtractPattern: args.csrfExtractPattern
            ? String(args.csrfExtractPattern)
            : undefined,
          cookieUrl: args.cookieUrl ? String(args.cookieUrl) : undefined,
          loginAccept: args.loginAccept ? String(args.loginAccept) : undefined,
          reauthStrategy: args.reauthStrategy
            ? String(args.reauthStrategy)
            : undefined,
          reauthBodyPattern: args.reauthBodyPattern
            ? String(args.reauthBodyPattern)
            : undefined,
          tokenFieldPath: args.tokenFieldPath
            ? String(args.tokenFieldPath)
            : undefined,
          headerName: args.headerName ? String(args.headerName) : undefined,
          headerValue: args.headerValue ? String(args.headerValue) : undefined,
        },
      );
      if (result.error) {
        attemptLog.push(`- create_auth(loginUrl=${args.loginUrl}, testUrl=${args.testUrl}, authStyle=${args.authStyle}, reauthStrategy=${args.reauthStrategy ?? "default"}) → ERROR: ${result.error}`);
        return JSON.stringify({ error: result.error });
      }
      return JSON.stringify({ authObjectId: result.id });
    }
    if (name === "create_auth_raw") {
      lastCreateArgs = { ...args, authStyle: "raw" };
      // Parse the steps, embedders, reauthTriggers from JSON strings
      let steps: Record<string, unknown>[];
      try {
        steps = JSON.parse(String(args.steps));
        if (!Array.isArray(steps) || steps.length === 0) {
          return JSON.stringify({ error: "steps must be a non-empty JSON array" });
        }
      } catch (e) {
        return JSON.stringify({ error: `Invalid steps JSON: ${e}` });
      }

      let embedders: Record<string, unknown>[] = [];
      if (args.embedders) {
        try {
          embedders = JSON.parse(String(args.embedders));
          if (!Array.isArray(embedders)) {
            return JSON.stringify({ error: "embedders must be a JSON array" });
          }
        } catch (e) {
          return JSON.stringify({ error: `Invalid embedders JSON: ${e}` });
        }
      }

      let reauthTriggers: Record<string, unknown>[] = [
        { type: "TRIGGER", location: "status", statuses: [401, 403] },
      ];
      if (args.reauthTriggers) {
        try {
          reauthTriggers = JSON.parse(String(args.reauthTriggers));
          if (!Array.isArray(reauthTriggers)) {
            return JSON.stringify({ error: "reauthTriggers must be a JSON array" });
          }
        } catch (e) {
          return JSON.stringify({ error: `Invalid reauthTriggers JSON: ${e}` });
        }
      }

      let successDetection: Record<string, unknown>[] = [
        { type: "status", statuses: [200] },
      ];
      if (args.successResponseDetection) {
        try {
          successDetection = JSON.parse(String(args.successResponseDetection));
          if (!Array.isArray(successDetection)) {
            return JSON.stringify({ error: "successResponseDetection must be a JSON array" });
          }
        } catch (e) {
          return JSON.stringify({ error: `Invalid successResponseDetection JSON: ${e}` });
        }
      }

      const testMethod = args.testMethod ? String(args.testMethod) : "GET";
      const testUrl = String(args.testUrl);

      // Follow redirects on test request — LLM decides based on context:
      // - true when reauthTriggers use body/dom patterns and app redirects to login
      // - false when reauthTriggers use header/status (need to see raw 302)
      const testFollowRedirects = args.testFollowRedirects !== undefined
        ? Boolean(args.testFollowRedirects)
        : false;
      const testMaxRedirects = args.testMaxRedirects !== undefined
        ? Number(args.testMaxRedirects)
        : (testFollowRedirects ? 5 : 0);

      // Ensure each step has protocol and bodyType defaults
      for (const step of steps) {
        const req = step.request as Record<string, unknown> | undefined;
        if (req) {
          if (!req.protocol) req.protocol = "http";
          if (!req.bodyType) req.bodyType = "clear_text";
        }
      }

      const body: Record<string, unknown> = {
        name: "Engine Auth — raw multistep",
        projectId,
        type: "multistep",
        test: {
          repeaterId,
          request: {
            method: testMethod,
            url: testUrl,
            protocol: "http",
            bodyType: "clear_text",
            followRedirects: testFollowRedirects,
            maxRedirects: testMaxRedirects,
            changeMethodOnRedirect: false,
          },
        },
        successResponseDetection: successDetection,
        reauthTriggers,
        config: {
          multistep: {
            steps,
            ...(embedders.length > 0 ? { embedders } : {}),
          },
        },
      };

      const stepNames = steps.map((s) => {
        const req = s.request as Record<string, unknown> | undefined;
        return `${s.name}(${req?.method ?? "?"} ${req?.url ?? "?"})`;
      }).join(" → ");
      console.log(`[Auth] Creating raw multistep auth — steps: ${stepNames}, test: ${testMethod} ${testUrl}`);

      const result = await postAuthObject(api, body);
      if (result.error) {
        attemptLog.push(`- create_auth_raw(steps=[${stepNames}], testUrl=${testUrl}) → ERROR: ${result.error}`);
        return JSON.stringify({ error: result.error });
      }
      return JSON.stringify({ authObjectId: result.id });
    }
    if (name === "test_auth_object") {
      const result = await testAuthObject(
        api,
        String(args.authObjectId),
      );
      // Log the test result with the create_auth params that produced this auth object
      const summary = JSON.stringify(result);
      const configSummary = lastCreateArgs.authStyle === "raw"
        ? `raw multistep, testUrl=${lastCreateArgs.testUrl}`
        : `loginUrl=${lastCreateArgs.loginUrl}, testUrl=${lastCreateArgs.testUrl}, authStyle=${lastCreateArgs.authStyle}, reauthStrategy=${lastCreateArgs.reauthStrategy ?? "default"}, csrfUrl=${lastCreateArgs.csrfUrl ?? "none"}`;
      if (!result.passed) {
        attemptLog.push(`- create_auth(${configSummary}) → test FAILED: ${result.summary ?? summary.slice(0, 300)}`);
      }
      return JSON.stringify(result);
    }
    if (name === "delete_auth_object") {
      await deleteAuthObject(
        api,
        String(args.authObjectId),
      );
      return "Deleted successfully";
    }
    if (name === "probe_url") {
      return probeUrl(args);
    }
    if (name === "run_command_on_host") {
      const cmd = String(args.command ?? "");
      console.log(`[Auth] run_command_on_host: ${cmd.slice(0, 200)}`);
      return runShellCommand(repoPath, cmd);
    }
    if (name === "run_command_in_docker") {
      const container = String(args.container ?? "");
      const cmd = String(args.command ?? "");
      console.log(`[Auth] run_command_in_docker [${container}]: ${cmd.slice(0, 200)}`);
      return execInDocker(repoPath, container, cmd);
    }
    return `Unknown tool: ${name}`;
  };

  const webHandler = createWebSearchHandler(repoPath);
  const combinedHandler: ToolHandler = async (name, args) => {
    if (
      name === "create_auth" ||
      name === "create_auth_raw" ||
      name === "test_auth_object" ||
      name === "delete_auth_object" ||
      name === "probe_url" ||
      name === "run_command_on_host" ||
      name === "run_command_in_docker"
    ) {
      return customHandler(name, args);
    }
    // Web search tools
    if (name === "search_web" || name === "fetch_url") {
      return webHandler(name, args);
    }
    // Codebase tools (search_files, read_file, list_files)
    if (
      name === "search_files" ||
      name === "read_file" ||
      name === "list_files"
    ) {
      return baseCodeHandler(name, args);
    }
    return inspectionHandler(name, args);
  };

  const baseCodeHandler = createToolHandler(repoPath);
  const allTools = [...codebaseTools, ...inspectionTools, ...customTools, ...webSearchTools];

  // Resolve protected endpoint path for test URL
  const resolvedPath = detection.protectedEndpointPath
    ? detection.protectedEndpointPath
        .replace(/:(\w+)/g, "1")
        .replace(/\{(\w+)\}/g, "1")
    : "/";
  const testUrl = `${baseUrl}${resolvedPath}`;

  const messages = configureAuthPrompt(baseUrl, testUrl, detection, registrationOk, preProbeContext);

  console.log("[Auth] Starting auth configuration with custom tools...");
  const response = await chatWithTools(
    llm,
    messages,
    allTools,
    combinedHandler,
    model,
    50,
  );

  const trimmed = response.trim();

  // Check for infrastructure repair request before normal auth parsing
  const infraRepairHint = parseInfraRepairResponse(trimmed);
  if (infraRepairHint) {
    console.log(`[Auth] LLM requested infrastructure repair: ${infraRepairHint.slice(0, 200)}`);
    return { authId: undefined, attemptLog, infraRepairHint };
  }

  const authId = parseAuthResponse(trimmed);
  if (!authId) {
    console.error(`[Auth] LLM could not configure auth (response: ${trimmed.slice(0, 200)})`);
    return { authId: undefined, attemptLog };
  }

  // Deterministic verification: re-test the auth object ourselves to ensure
  // every stage passes. The LLM may have returned an ID after a failed test,
  // or modified the object after the last test.
  console.log(`[Auth] Verifying auth object ${authId} — running deterministic test...`);
  const verification = await testAuthObject(api, authId);
  if (!verification.passed) {
    console.error(`[Auth] Verification FAILED for ${authId}: ${verification.summary?.slice(0, 300)}`);
    // Include full diagnostics (with DIAGNOSTIC hints) in the attempt log so
    // the next LLM attempt has specific guidance on what to fix.
    attemptLog.push(`- Auth object ${authId} returned by LLM but deterministic verification failed:\n${verification.summary?.slice(0, 600)}`);
    // Clean up the failed auth object so it doesn't pollute the project
    await deleteAuthObject(api, authId);
    return { authId: undefined, attemptLog };
  }
  console.log(`[Auth] Verification PASSED for ${authId} — all stages successful`);
  return { authId, attemptLog };
}

// ---------------------------------------------------------------------------
// Register a test user locally before login (for apps with no seeded users)
// ---------------------------------------------------------------------------

export async function registerUser(
  baseUrl: string,
  detection: AuthDetection,
): Promise<boolean> {
  if (!detection.registerEndpoint || !detection.registerBody) return false;

  const url = `${baseUrl}${detection.registerEndpoint}`;
  const ct = CONTENT_TYPE_MAP[detection.loginContentType] ?? "application/json";
  const body = normalizeBody(
    detection.registerBody,
    detection.loginContentType,
  );

  try {
    console.log(
      `[Auth] Registering test user via ${detection.registerMethod ?? "POST"} ${detection.registerEndpoint}`,
    );
    console.log(`[Auth] Registration body: ${body.slice(0, 400)}`);
    const res = await fetch(url, {
      method: detection.registerMethod ?? "POST",
      headers: { "Content-Type": ct },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_LONG),
    });
    console.log(`[Auth] Registration response: ${res.status}`);
    if (res.status >= 400) {
      const body = await res.text().catch(() => "");
      if (body) console.log(`[Auth] Registration error: ${body.slice(0, 300)}`);
    }
    // 2xx or 302 redirect = success; 4xx/5xx = failure
    return res.status >= 200 && res.status < 400;
  } catch (err) {
    console.warn(
      `[Auth] Registration call failed (user may already exist): ${err}`,
    );
    return false;
  }
}

/**
 * Re-register the test user after an app restart (fresh container = empty DB).
 * Takes the registration info from AuthResult so the orchestrator doesn't need
 * to keep the full AuthDetection around.
 */
export async function reRegisterUser(
  registration: NonNullable<AuthResult["registration"]>,
): Promise<void> {
  const url = `${registration.baseUrl}${registration.endpoint}`;
  const ct = CONTENT_TYPE_MAP[registration.contentType] ?? "application/json";
  const body = normalizeBody(registration.body, registration.contentType);

  try {
    console.log(
      `[Auth] Re-registering test user via ${registration.method} ${registration.endpoint}`,
    );
    const res = await fetch(url, {
      method: registration.method,
      headers: { "Content-Type": ct },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_LONG),
    });
    console.log(`[Auth] Re-registration response: ${res.status}`);
  } catch (err) {
    console.warn(
      `[Auth] Re-registration failed (user may already exist): ${err}`,
    );
  }
}

/**
 * Replay CLI seed commands captured during the initial seedTestUser phase.
 * This handles apps that create users via CLI (docker exec, rails runner, etc.)
 * rather than HTTP registration endpoints.
 */
export async function replaySeedCommands(
  repoPath: string,
  commands: SeedCommand[],
): Promise<void> {
  console.log(`[Auth] Replaying ${commands.length} seed command(s)...`);
  for (const cmd of commands) {
    try {
      if (cmd.type === "docker" && cmd.container) {
        console.log(`[Auth:Replay] docker exec [${cmd.container}]: ${cmd.command.slice(0, 200)}`);
        await execInDocker(repoPath, cmd.container, cmd.command);
      } else {
        console.log(`[Auth:Replay] host: ${cmd.command.slice(0, 200)}`);
        await runShellCommand(repoPath, cmd.command);
      }
    } catch (err) {
      // Non-fatal — user may already exist (--force-update handles this)
      console.warn(`[Auth:Replay] Command failed (may be OK if user exists): ${err}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Seed test user sub-phase — dedicated LLM session for user creation
// ---------------------------------------------------------------------------

interface SeedUserResult {
  success: boolean;
  username: string;
  password: string;
  email: string;
  reason?: string;
}

async function seedTestUser(
  llm: OpenAI,
  repoPath: string,
  baseUrl: string,
  detection: AuthDetection,
  model?: string,
  activationHint?: string,
): Promise<SeedUserResult | undefined> {
  console.log("[Auth] Starting seed user sub-phase...");

  // Track CLI commands for replay after restart
  const capturedCommands: SeedCommand[] = [];

  const seedTools: ChatCompletionTool[] = [
    ...codebaseTools,
    ...webSearchTools,
    runCommandOnHostTool,
    runCommandInDockerTool,
    probeUrlTool,
  ];

  const baseCodeHandler = createToolHandler(repoPath);
  const seedWebHandler = createWebSearchHandler(repoPath);
  const handler: ToolHandler = async (name, args) => {
    if (name === "run_command_on_host") {
      const cmd = String(args.command ?? "");
      console.log(`[Auth:Seed] run_command_on_host: ${cmd.slice(0, 200)}`);
      capturedCommands.push({ type: "host", command: cmd });
      return runShellCommand(repoPath, cmd);
    }
    if (name === "run_command_in_docker") {
      const container = String(args.container ?? "");
      const cmd = String(args.command ?? "");
      console.log(`[Auth:Seed] run_command_in_docker [${container}]: ${cmd.slice(0, 200)}`);
      capturedCommands.push({ type: "docker", command: cmd, container });
      return execInDocker(repoPath, container, cmd);
    }
    if (name === "probe_url") {
      return probeUrl(args);
    }
    if (name === "search_web" || name === "fetch_url") {
      return seedWebHandler(name, args);
    }
    return baseCodeHandler(name, args);
  };

  const messages = seedUserPrompt(baseUrl, detection);
  // If activation hint is provided, inject it as a high-priority user message
  if (activationHint) {
    messages.push({ role: "user", content: activationHint });
  }
  const response = await chatWithTools(llm, messages, seedTools, handler, model, 30);

  try {
    const json = extractJson(response);
    const result = JSON.parse(json) as SeedUserResult;
    if (result.success) {
      console.log(`[Auth:Seed] User created: ${result.username} / ${result.email}`);
      // Attach captured commands for replay
      if (capturedCommands.length > 0) {
        (result as SeedUserResult & { seedCommands?: SeedCommand[] }).seedCommands = capturedCommands;
        console.log(`[Auth:Seed] Captured ${capturedCommands.length} seed command(s) for replay`);
      }
      return result;
    }
    console.warn(`[Auth:Seed] Failed to create user: ${result.reason ?? "unknown"}`);
    return undefined;
  } catch {
    console.warn(`[Auth:Seed] Could not parse seed result: ${response.slice(0, 200)}`);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Test the auth object (sync GET with retry)
// ---------------------------------------------------------------------------

export async function testAuthObject(
  api: BrightApiContext,
  authObjectId: string,
): Promise<AuthTestResult> {
  const base = `https://${api.brightHostname}`;
  const url = `${base}/api/v3/auth-objects/${encodeURIComponent(authObjectId)}/test`;
  const headers: Record<string, string> = {
    Authorization: `Api-Key ${api.brightToken}`,
    Accept: "application/json",
  };

  const maxRetries = 5;
  const retryDelayMs = 5_000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(
      `[Auth] Testing auth object (attempt ${attempt}/${maxRetries})`,
    );

    try {
      const res = await fetch(url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_EXTENDED),
      });

      if (res.status === 503) {
        const body = await res.text().catch(() => "");
        console.warn(`[Auth] Test returned 503: ${body.slice(0, 200)}`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, retryDelayMs));
          continue;
        }
        return {
          passed: false,
          summary: `503 after ${maxRetries} retries — ${body.slice(0, 300)}`,
        };
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          passed: false,
          summary: `HTTP ${res.status} — ${body.slice(0, 400)}`,
        };
      }

      const BODY_PREVIEW_LIMIT = 800;

      const rawResults = (await res.json()) as Array<{
        stage: string;
        status: string;
        name?: string;
        message?: string;
        request?: {
          method?: string;
          url?: string;
          body?: string;
          headers?: Record<string, string>;
        };
        response?: {
          status?: number;
          body?: string;
          headers?: Record<string, string | string[]>;
        };
      }>;

      if (rawResults.length === 0) {
        return { passed: false, summary: "No results returned" };
      }

      // Build rich stage details for the LLM
      const stages: AuthTestStageDetail[] = rawResults.map((r) => {
        const detail: AuthTestStageDetail = {
          stage: r.stage,
          status: r.status,
        };
        if (r.name) detail.name = r.name;
        if (r.message) detail.message = r.message;

        if (r.request) {
          detail.request = {
            method: r.request.method ?? "GET",
            url: r.request.url ?? "",
          };
          if (r.request.body) {
            detail.request.body = r.request.body.slice(0, BODY_PREVIEW_LIMIT);
          }
        }

        if (r.response) {
          const rawBody = r.response.body ?? "";
          const respCt = (() => {
            const hdrs = r.response.headers;
            if (!hdrs) return "";
            const ct = hdrs["content-type"] ?? hdrs["Content-Type"];
            return (Array.isArray(ct) ? ct[0] : ct) ?? "";
          })();
          // For HTML error responses, strip tags so the preview shows the
          // actual error text (e.g. "No such file or directory - magick")
          // instead of 800 chars of <head> boilerplate.
          const isHtml = respCt.includes("html") || rawBody.trimStart().startsWith("<");
          const previewText = isHtml ? stripHtmlForAnalysis(rawBody) : rawBody;
          detail.response = {
            status: r.response.status ?? 0,
            bodyPreview: previewText.slice(0, BODY_PREVIEW_LIMIT),
          };
          // For failed stages with large bodies, save to file so the LLM
          // can read_file for the full error context
          if (r.status !== "success" && rawBody.length > BODY_PREVIEW_LIMIT) {
            const saved = saveProbeBody(rawBody, respCt || "text/html");
            if (saved) {
              detail.response.bodyFile = saved;
            }
          }
          // Extract Set-Cookie and Content-Type from response headers
          const hdrs = r.response.headers;
          if (hdrs) {
            const ct =
              hdrs["content-type"] ?? hdrs["Content-Type"];
            if (ct) {
              detail.response.contentType = Array.isArray(ct)
                ? ct[0]
                : ct;
            }
            const sc =
              hdrs["set-cookie"] ?? hdrs["Set-Cookie"];
            if (sc) {
              // Trim long cookie values — keep name + first 80 chars
              const cookies = Array.isArray(sc) ? sc : [sc];
              detail.response.setCookie = cookies.map((c: string) =>
                c.length > 120 ? c.slice(0, 120) + "…" : c,
              );
            }
          }
        }

        return detail;
      });

      // Summary lines for logging
      const lines = stages.map(
        (s) =>
          `${s.name ? `[${s.name}] ` : ""}stage=${s.stage} status=${s.status}` +
          `${s.message ? ` — ${s.message}` : ""}` +
          `${s.response ? ` (HTTP ${s.response.status}, ${s.response.contentType ?? "unknown"}, body=${s.response.bodyPreview.slice(0, 120)}…)` : ""}`,
      );
      for (const l of lines) console.log(`[Auth] Test: ${l}`);

      // --- Smart diagnostic hints ---
      // Detect common auth failure patterns and provide actionable guidance.
      const diagnosticHints: string[] = [];
      for (const s of stages) {
        if (s.status === "success" || !s.response) continue;

        const ct = s.response.contentType ?? "";
        const isHtml = ct.includes("html");
        const httpStatus = s.response.status ?? 0;

        // Pattern 1: Auth/login step returned HTML instead of JSON.
        // Many frameworks (Rails, Django, Express) return HTML by default
        // when no Accept header is set. The auth flow expects JSON.
        // This covers: 500 + HTML (crash during render), 200 + HTML (login
        // page instead of JSON), 302 + HTML (redirect), 422 + HTML, etc.
        if (s.stage === "authentication" && isHtml) {
          // Check if the request had an Accept header asking for JSON
          const reqHeaders = s.request as Record<string, unknown> | undefined;
          const alreadyAskedForJson = JSON.stringify(reqHeaders ?? {}).toLowerCase().includes("application/json");

          if (httpStatus === 500) {
            diagnosticHints.push(
              `DIAGNOSTIC: The "${s.name ?? "login"}" step returned HTTP 500 with Content-Type text/html. ` +
              `This usually means the server tried to render HTML but crashed ` +
              `(e.g. missing system dependency like ImageMagick). ` +
              `TWO actions to consider:\n` +
              `  1. QUICK FIX: Recreate the auth object with loginAccept='application/json' — ` +
              `this tells the server to return JSON instead of HTML, bypassing the render crash.\n` +
              `  2. ROOT CAUSE: The app has broken HTML rendering. Use run_command_in_docker to ` +
              `check application logs for the actual error. ` +
              `Consider this an infrastructure issue — report via INFRA_REPAIR.`,
            );
          } else if (!alreadyAskedForJson) {
            diagnosticHints.push(
              `DIAGNOSTIC: The "${s.name ?? "login"}" step returned Content-Type text/html (HTTP ${httpStatus}). ` +
              `The login request did NOT include an Accept header requesting JSON. ` +
              `Many web frameworks return HTML login pages by default and only return ` +
              `JSON when the client sends Accept: application/json.\n` +
              `FIX: Recreate the auth object with loginAccept='application/json' (for create_auth) ` +
              `or add a { name: "Accept", value: "application/json" } header to the login step (for create_auth_raw). ` +
              `This is the most common cause of auth failures on server-rendered apps (Rails, Django, Laravel, etc.).`,
            );
          } else {
            diagnosticHints.push(
              `DIAGNOSTIC: The "${s.name ?? "login"}" step returned Content-Type text/html (HTTP ${httpStatus}) ` +
              `even though Accept: application/json was sent. The server does not support JSON responses ` +
              `for this endpoint, or the URL is wrong (e.g. returns the login page instead of processing the login). ` +
              `Check that loginUrl points to the API login endpoint, not the HTML login page.`,
            );
          }
        }

        // Pattern 2: Validation stage got HTML — CSRF/cookie URL returned
        // HTML instead of a JSON CSRF token endpoint.
        if (s.stage === "validation" && isHtml && s.status !== "success") {
          diagnosticHints.push(
            `DIAGNOSTIC: The "${s.name ?? "validation"}" step (CSRF/cookie) returned HTML (HTTP ${httpStatus}). ` +
            `If this is a CSRF token fetch, make sure csrfUrl points to a JSON API endpoint ` +
            `(e.g. /session/csrf.json or /api/csrf) rather than an HTML page. ` +
            `Also try adding Accept: application/json header to the request.`,
          );
        }
      }

      const allPassed = rawResults.every((r) => r.status === "success");
      const fullSummary = diagnosticHints.length > 0
        ? lines.join("\n") + "\n\n" + diagnosticHints.join("\n")
        : lines.join("\n");
      return { passed: allPassed, summary: fullSummary, stages };
    } catch (err) {
      const msg = toErrorMessage(err);
      console.warn(`[Auth] Test error on attempt ${attempt}: ${msg}`);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
      return { passed: false, summary: `Test failed: ${msg}` };
    }
  }

  return { passed: false, summary: "Exhausted retries" };
}

/**
 * If the content type is "form" but the body looks like JSON, convert it to
 * URL-encoded form data. This prevents sending `{"username":"x","password":"y"}`
 * with Content-Type application/x-www-form-urlencoded (which servers won't parse).
 */
function normalizeBody(body: string, contentType: string): string {
  if (contentType !== "form") return body;
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, string>;
      const encoded = new URLSearchParams(obj).toString();
      console.log(
        `[Auth] Converted JSON loginBody to form-encoded: ${encoded.slice(0, 200)}`,
      );
      return encoded;
    } catch {
      return body;
    }
  }
  return body;
}

// ---------------------------------------------------------------------------
// Delete a broken auth object before retrying
// ---------------------------------------------------------------------------

async function deleteAuthObject(
  api: BrightApiContext,
  authObjectId: string,
): Promise<void> {
  try {
    const res = await fetch(
      `https://${api.brightHostname}/api/v3/auth-objects/${encodeURIComponent(authObjectId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Api-Key ${api.brightToken}` },
      },
    );
    if (res.ok || res.status === 204) {
      console.log(`[Auth] Deleted failed auth object ${authObjectId}`);
    } else {
      console.warn(`[Auth] Failed to delete auth object: ${res.status}`);
    }
  } catch (err) {
    console.warn(`[Auth] Failed to delete auth object: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// parseInfraRepairResponse — detect INFRA_REPAIR: signal from auth LLM
// ---------------------------------------------------------------------------

function parseInfraRepairResponse(trimmed: string): string | undefined {
  // Permissive match — LLMs may prefix with explanation text or markdown
  const match = trimmed.match(/INFRA_REPAIR:\s*(.+)/s);
  if (match?.[1]) {
    return match[1].trim();
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// parseAuthResponse — validates LLM response from the configure phase
// ---------------------------------------------------------------------------

const FALSE_ESCAPE_RE = /no\s*auth|auth.*not\s*required|auth.*skipped|does\s*not\s*require|doesn['']t\s*require|no\s*authentication/i;

function parseAuthResponse(trimmed: string): string | undefined {
  if (trimmed === "FAILED" || trimmed.length === 0) {
    return undefined;
  }
  // Catch false "no auth required" responses — LLM may hallucinate
  if (FALSE_ESCAPE_RE.test(trimmed)) {
    console.warn(`[Auth] Detected false "no auth" escape from LLM — treating as FAILED`);
    return undefined;
  }
  // Extract auth object ID from response.
  // Bright IDs come in three formats:
  //   • MongoDB ObjectId — 24 hex chars  (e.g. 507f1f77bcf86cd799439011)
  //   • UUID             — 36 hex+dash   (e.g. 550e8400-e29b-41d4-a716-446655440000)
  //   • NanoID           — 20-24 base62   (e.g. 8TiJo1cG18whEV69KbABWy)
  const idMatch = trimmed.match(
    /[0-9a-f]{24}|[0-9a-f-]{36}|[A-Za-z0-9_-]{20,24}/i,
  );
  return idMatch ? idMatch[0] : undefined;
}

// ---------------------------------------------------------------------------
// autoProbeCsrf — fetches a CSRF URL and auto-detects the extraction pattern
// ---------------------------------------------------------------------------

const COMMON_CSRF_KEYS = [
  "csrf",
  "_csrf",
  "csrfToken",
  "csrf_token",
  "authenticity_token",
  "token",
  "X-CSRF-Token",
  "_token",
];

async function autoProbeCsrf(csrfUrl: string): Promise<string | undefined> {
  try {
    console.log(`[Auth] Auto-probing CSRF URL: ${csrfUrl}`);
    const res = await fetch(csrfUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_DEFAULT),
    });
    const body = await res.text();

    // Try to parse as JSON and find a known CSRF key
    try {
      const json = JSON.parse(body);
      for (const key of COMMON_CSRF_KEYS) {
        if (typeof json[key] === "string" && json[key].length > 10) {
          const pattern = `"${key}"\\s*:\\s*"([^"]+)"`;
          console.log(`[Auth] Auto-detected CSRF pattern: ${pattern} (key="${key}", sample="${json[key].slice(0, 20)}...")`);
          return pattern;
        }
      }
      // Check nested objects one level deep
      for (const [topKey, topVal] of Object.entries(json)) {
        if (topVal && typeof topVal === "object") {
          for (const key of COMMON_CSRF_KEYS) {
            if (typeof (topVal as Record<string, unknown>)[key] === "string" && ((topVal as Record<string, unknown>)[key] as string).length > 10) {
              const pattern = `"${key}"\\s*:\\s*"([^"]+)"`;
              console.log(`[Auth] Auto-detected CSRF pattern (nested in ${topKey}): ${pattern}`);
              return pattern;
            }
          }
        }
      }
    } catch {
      // Not JSON — try HTML meta tag pattern (Rails)
      const metaMatch = body.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i);
      if (metaMatch) {
        const pattern = `<meta\\s+name=["']csrf-token["']\\s+content=["']([^"']+)["']`;
        console.log(`[Auth] Auto-detected CSRF from HTML meta tag`);
        return pattern;
      }
    }
    console.log(`[Auth] Could not auto-detect CSRF pattern from ${csrfUrl}`);
    return undefined;
  } catch (err) {
    console.warn(`[Auth] CSRF auto-probe failed: ${toErrorMessage(err)}`);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// preProbeForAuth — fetches key URLs before the LLM starts, providing context
// ---------------------------------------------------------------------------

async function preProbeForAuth(
  baseUrl: string,
  detection: AuthDetection,
): Promise<string> {
  const lines: string[] = [];

  // 1. Probe the CSRF URL if session auth and we know the endpoint
  if (detection.authType === "session" && detection.loginEndpoint) {
    // Common CSRF endpoints for known frameworks
    const csrfCandidates = [
      `${baseUrl}/session/csrf`,    // Discourse
      `${baseUrl}/csrf`,            // generic
    ];
    for (const csrfUrl of csrfCandidates) {
      try {
        const res = await fetch(csrfUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
          redirect: "manual",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MEDIUM),
        });
        const body = await res.text();
        if (res.status === 200 && body.length > 0) {
          const preview = body.length > 500 ? body.slice(0, 500) + "..." : body;
          lines.push(`### CSRF probe: GET ${csrfUrl} → ${res.status}\n\`\`\`\n${preview}\n\`\`\``);
          break; // Found a working CSRF endpoint
        }
      } catch { /* skip */ }
    }
  }

  // 2. Probe the login endpoint to see if it's an HTML page or API
  if (detection.loginEndpoint) {
    const loginUrl = `${baseUrl}${detection.loginEndpoint}`;
    try {
      const getRes = await fetch(loginUrl, {
        method: "GET",
        headers: { Accept: "text/html, application/json, */*" },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MEDIUM),
      });
      const getBody = await getRes.text();
      const ct = getRes.headers.get("content-type") ?? "";
      const isHtml = ct.includes("html") || getBody.trimStart().startsWith("<");
      const preview = getBody.length > 1000 ? getBody.slice(0, 1000) + "..." : getBody;
      const loginType = isHtml ? "HTML page (NOT an API endpoint)" : "API endpoint";
      lines.push(`### Login endpoint probe: GET ${loginUrl} → ${getRes.status} (${loginType})\nContent-Type: ${ct}\n\`\`\`\n${preview}\n\`\`\``);

      // If GET /login returned 405/404, the login form is likely at a different URL
      // Many apps (Miniflux, etc.) redirect unauthenticated users to / which shows the login form
      if (getRes.status === 405 || getRes.status === 404) {
        lines.push(`\n**NOTE**: GET ${loginUrl} returned ${getRes.status} — the login form is NOT at this URL. Probing root URL for the actual login form...`);
        try {
          const rootRes = await fetch(baseUrl + "/", {
            method: "GET",
            headers: { Accept: "text/html, */*" },
            redirect: "follow",
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MEDIUM),
          });
          const rootBody = await rootRes.text();
          const rootCt = rootRes.headers.get("content-type") ?? "";
          const rootIsHtml = rootCt.includes("html") || rootBody.trimStart().startsWith("<");
          if (rootIsHtml && rootBody.length > 0) {
            const rootPreview = rootBody.length > 1500 ? rootBody.slice(0, 1500) + "..." : rootBody;
            lines.push(`### Login form fallback: GET ${baseUrl}/ → ${rootRes.status} (login form found at root)\nContent-Type: ${rootCt}\n\`\`\`\n${rootPreview}\n\`\`\``);

            // Extract CSRF hidden inputs from the form HTML
            const csrfInputMatch = rootBody.match(/<input[^>]+type=["']hidden["'][^>]+name=["'](csrf|csrfmiddlewaretoken|_token|authenticity_token|_csrf_token|csrfToken)[^"']*["'][^>]*value=["']([^"']+)["']/i)
              || rootBody.match(/<input[^>]+name=["'](csrf|csrfmiddlewaretoken|_token|authenticity_token|_csrf_token|csrfToken)[^"']*["'][^>]+type=["']hidden["'][^>]*value=["']([^"']+)["']/i)
              || rootBody.match(/<input[^>]+name=["'](csrf|csrfmiddlewaretoken|_token|authenticity_token|_csrf_token|csrfToken)[^"']*["'][^>]+value=["']([^"']+)["']/i);
            if (csrfInputMatch) {
              lines.push(`\n**⚠️ CSRF TOKEN FOUND**: Hidden input field name="${csrfInputMatch[1]}" with a live token value. The login POST **requires** this field in the body. Use \`create_auth_raw\` with NexTemplate extraction.`);
            }

            // Extract form action
            const formActionMatch = rootBody.match(/<form[^>]+action=["']([^"']+)["']/i);
            if (formActionMatch?.[1]) {
              lines.push(`**Login form action**: ${formActionMatch[1]}`);
            }
          }
        } catch { /* skip root fallback */ }
      }

      // If it's HTML, look for form action to find the real API endpoint
      if (isHtml) {
        // Check for CSRF hidden inputs in the login form HTML
        const csrfInputMatch = getBody.match(/<input[^>]+type=["']hidden["'][^>]+name=["'](csrf|csrfmiddlewaretoken|_token|authenticity_token|_csrf_token|csrfToken)[^"']*["'][^>]*value=["']([^"']+)["']/i)
          || getBody.match(/<input[^>]+name=["'](csrf|csrfmiddlewaretoken|_token|authenticity_token|_csrf_token|csrfToken)[^"']*["'][^>]+type=["']hidden["'][^>]*value=["']([^"']+)["']/i)
          || getBody.match(/<input[^>]+name=["'](csrf|csrfmiddlewaretoken|_token|authenticity_token|_csrf_token|csrfToken)[^"']*["'][^>]+value=["']([^"']+)["']/i);
        if (csrfInputMatch) {
          lines.push(`\n**⚠️ CSRF TOKEN FOUND**: Hidden input field name="${csrfInputMatch[1]}" with a live token value. The login POST **requires** this field in the body. Use \`create_auth_raw\` with NexTemplate extraction from GET ${loginUrl}.`);
        }

        const actionMatch = getBody.match(/action=["']([^"']+)["']/i);
        const apiCandidates = new Set<string>();
        if (actionMatch?.[1]) {
          const action = actionMatch[1];
          apiCandidates.add(action.startsWith("http") ? action : `${baseUrl}${action}`);
        }
        // Common API login endpoint patterns
        const path = detection.loginEndpoint.replace(/^\//, "");
        for (const candidate of [
          `${baseUrl}/session`,
          `${baseUrl}/api/session`,
          `${baseUrl}/api/auth/login`,
          `${baseUrl}/api/login`,
          `${baseUrl}/auth/sign_in`,
        ]) {
          apiCandidates.add(candidate);
        }
        for (const apiUrl of apiCandidates) {
          try {
            const apiRes = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: "{}",
              redirect: "manual",
              signal: AbortSignal.timeout(FETCH_TIMEOUT_MEDIUM),
            });
            const apiBody = await apiRes.text();
            const apiPreview = apiBody.length > 500 ? apiBody.slice(0, 500) + "..." : apiBody;
            // 403/422/400 with JSON body = likely the real API endpoint (it rejected empty creds)
            const looksLikeApi = apiRes.status !== 404 && !apiBody.trimStart().startsWith("<");
            if (looksLikeApi) {
              lines.push(`### Candidate API login: POST ${apiUrl} → ${apiRes.status} (likely real login endpoint)\n\`\`\`\n${apiPreview}\n\`\`\``);
            }
          } catch { /* skip */ }
        }
        lines.push(`\n**WARNING**: The detected loginEndpoint "${detection.loginEndpoint}" is an HTML page, NOT the API endpoint. Use the real API endpoint found above as loginUrl in create_auth.`);
      }
    } catch { /* skip */ }
  }

  // 3. Probe candidate test URLs to find ones that differentiate auth/unauth
  const candidateTestUrls = new Set<string>();
  // Add the detected protected endpoint
  if (detection.protectedEndpointPath) {
    const resolved = detection.protectedEndpointPath
      .replace(/:(\w+)/g, "1")
      .replace(/\{(\w+)\}/g, "1");
    candidateTestUrls.add(`${baseUrl}${resolved}`);
  }
  // Common .json endpoints
  candidateTestUrls.add(`${baseUrl}/notifications.json`);
  candidateTestUrls.add(`${baseUrl}/session/current.json`);

  for (const url of candidateTestUrls) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MEDIUM),
      });
      const body = await res.text();
      const preview = body.length > 300 ? body.slice(0, 300) + "..." : body;
      lines.push(`### Test URL probe: GET ${url} → ${res.status}\n\`\`\`\n${preview}\n\`\`\``);
    } catch { /* skip */ }
  }

  if (lines.length === 0) {
    return "";
  }

  console.log(`[Auth] Pre-probed ${lines.length} endpoints for LLM context`);
  return lines.join("\n\n");
}

// ---------------------------------------------------------------------------
// repairBrokenLogin — LLM session to diagnose and fix a broken login endpoint
// ---------------------------------------------------------------------------

async function repairBrokenLogin(
  llm: OpenAI,
  repoPath: string,
  baseUrl: string,
  diagnostic: string,
  model?: string,
): Promise<boolean> {
  console.log("[Auth] Starting login repair sub-phase...");

  // Same tools as seedTestUser — docker access, probing, codebase, web search
  const repairTools: ChatCompletionTool[] = [
    ...codebaseTools,
    ...webSearchTools,
    runCommandOnHostTool,
    runCommandInDockerTool,
    probeUrlTool,
  ];

  const baseCodeHandler = createToolHandler(repoPath);
  const repairWebHandler = createWebSearchHandler(repoPath);
  const handler: ToolHandler = async (name, args) => {
    if (name === "run_command_on_host") {
      const cmd = String(args.command ?? "");
      console.log(`[Auth:Repair] run_command_on_host: ${cmd.slice(0, 200)}`);
      return runShellCommand(repoPath, cmd);
    }
    if (name === "run_command_in_docker") {
      const container = String(args.container ?? "");
      const cmd = String(args.command ?? "");
      console.log(`[Auth:Repair] run_command_in_docker [${container}]: ${cmd.slice(0, 200)}`);
      return execInDocker(repoPath, container, cmd, 120_000);
    }
    if (name === "probe_url") {
      return probeUrl(args);
    }
    if (name === "search_web" || name === "fetch_url") {
      return repairWebHandler(name, args);
    }
    return baseCodeHandler(name, args);
  };

  const messages = repairBrokenLoginPrompt(baseUrl, diagnostic);
  const response = await chatWithTools(llm, messages, repairTools, handler, model, 30);

  try {
    const json = extractJson(response);
    const result = JSON.parse(json) as { fixed: boolean; action?: string; reason?: string };
    if (result.fixed) {
      console.log(`[Auth:Repair] Login fixed: ${result.action ?? "unknown action"}`);
      return true;
    }
    console.warn(`[Auth:Repair] Could not fix login: ${result.reason ?? "unknown"}`);
    return false;
  } catch {
    console.warn(`[Auth:Repair] Could not parse repair result: ${response.slice(0, 200)}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Pre-auth login sanity check — verify the login flow actually works before
// burning LLM turns. Tries CSRF fetch → POST login with seeded creds.
// Returns a diagnostic string and a boolean indicating if login is functional.
// ---------------------------------------------------------------------------

interface LoginSanityResult {
  /** True if the login endpoint is at least reachable and not crashing (2xx/3xx/4xx). */
  functional: boolean;
  /** Diagnostic text to include in LLM context. */
  diagnostic: string;
}

async function preAuthLoginSanityCheck(
  baseUrl: string,
  detection: AuthDetection,
): Promise<LoginSanityResult> {
  if (!detection.loginEndpoint) {
    return { functional: true, diagnostic: "" };
  }

  const loginUrl = `${baseUrl}${detection.loginEndpoint}`;
  const lines: string[] = [];
  let csrfToken: string | undefined;
  let sessionCookie: string | undefined;
  let functional = true;

  // Step 1: Try to get a CSRF token if session auth
  if (detection.authType === "session") {
    const csrfCandidates = [
      `${baseUrl}/session/csrf`,
      `${baseUrl}/csrf`,
    ];
    for (const csrfUrl of csrfCandidates) {
      try {
        const res = await fetch(csrfUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
          redirect: "manual",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MEDIUM),
        });
        const body = await res.text();
        if (res.status === 200 && !body.trimStart().startsWith("<")) {
          // Try to extract CSRF token
          const csrfMatch = body.match(/"csrf"\s*:\s*"([^"]*)"/);
          if (csrfMatch?.[1]) {
            csrfToken = csrfMatch[1];
          }
          // Extract session cookie
          const setCookies: string[] =
            extractSetCookies(res.headers);
          for (const sc of setCookies) {
            const pair = sc.split(";")[0]?.trim();
            if (pair?.includes("=")) {
              sessionCookie = (sessionCookie ? sessionCookie + "; " : "") + pair;
            }
          }
          break;
        } else if (res.status >= 500) {
          lines.push(`⚠️ CSRF endpoint ${csrfUrl} returned HTTP ${res.status} — the app's session system may be broken.`);
          functional = false;
        }
      } catch { /* skip */ }
    }
  }

  // Step 2: Try the actual login POST with whatever creds we have
  // Even without creds, send an empty POST to check the endpoint isn't crashing
  const loginBody = detection.loginBody ?? "{}";
  {
    const headers: Record<string, string> = {
      "Content-Type": detection.loginContentType === "form"
        ? "application/x-www-form-urlencoded"
        : "application/json",
      Accept: "application/json",
    };
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
    if (sessionCookie) headers["Cookie"] = sessionCookie;

    try {
      const res = await fetch(loginUrl, {
        method: "POST",
        headers,
        body: loginBody,
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_DEFAULT),
      });
      const body = await res.text();
      const preview = body.length > 300 ? body.slice(0, 300) + "..." : body;

      if (res.status >= 500) {
        functional = false;
        lines.push(
          `🚨 **LOGIN ENDPOINT BROKEN**: POST ${loginUrl} → HTTP ${res.status}\n`
          + `Response: \`${preview}\`\n`
          + `The application's login is crashing with a server error. `
          + `This is NOT an auth configuration issue — the app itself is broken. `
          + `Auth configuration cannot succeed until the app's login works.`,
        );
      } else if (res.status === 403 && body.includes("CSRF")) {
        // 403 with CSRF error means login endpoint works but needs proper CSRF
        lines.push(
          `### Login sanity check: POST ${loginUrl} → ${res.status} (CSRF required)\n`
          + `The login endpoint is functional but requires a valid CSRF token. `
          + `Response: \`${preview}\``,
        );
      } else if (res.status === 200 || res.status === 201 || res.status === 302) {
        // Check if it's a success or an error-in-200
        const hasError = /error|invalid|incorrect|failed/i.test(body);
        if (hasError) {
          lines.push(
            `### Login sanity check: POST ${loginUrl} → ${res.status} (credentials rejected)\n`
            + `The login endpoint is functional but rejected the credentials. `
            + `Response: \`${preview}\``,
          );
        } else {
          lines.push(
            `### Login sanity check: POST ${loginUrl} → ${res.status} ✅ Login works!`,
          );
        }
      } else {
        lines.push(
          `### Login sanity check: POST ${loginUrl} → ${res.status}\n`
          + `Response: \`${preview}\``,
        );
      }
    } catch (err) {
      lines.push(
        `### Login sanity check: POST ${loginUrl} → connection error: ${toErrorMessage(err)}`,
      );
    }
  }

  const diagnostic = lines.join("\n\n");
  if (diagnostic) {
    console.log(`[Auth] Login sanity check: ${functional ? "functional" : "BROKEN"}`);
    if (!functional) {
      console.error(`[Auth] Login endpoint is broken — app may be in an unstable state`);
    }
  }
  return { functional, diagnostic };
}

// ---------------------------------------------------------------------------
// discoverLoginEndpoint — try common login endpoint patterns to find one that
// responds (non-404). Used when detection didn't find a loginEndpoint.
// ---------------------------------------------------------------------------

async function discoverLoginEndpoint(baseUrl: string): Promise<string | null> {
  const candidates = [
    "/session",
    "/api/session",
    "/api/auth/login",
    "/auth/sign_in",
    "/login",
    "/api/login",
  ];

  for (const path of candidates) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: "{}",
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_SHORT),
      });
      // 404 = endpoint doesn't exist. Anything else (200, 400, 403, 422) = it exists.
      if (res.status !== 404) {
        return path;
      }
    } catch { /* connection error — skip */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// verifySeededCredentials — after seeding, attempt an actual login to confirm
// the reported credentials work. Catches the case where the seed LLM changed
// the password but reported the original template value.
// ---------------------------------------------------------------------------

async function verifySeededCredentials(
  baseUrl: string,
  creds: SeedUserResult,
  detection: AuthDetection,
): Promise<{ valid: boolean; reason: string }> {
  const loginEndpoint = detection.loginEndpoint ?? "/session";
  const loginUrl = `${baseUrl}${loginEndpoint}`;

  // Step 1: Try to get a CSRF token (many apps need this)
  let csrfToken: string | undefined;
  let csrfFieldName: string | undefined;
  let sessionCookie: string | undefined;

  // Step 1a: Check JSON CSRF endpoints (Discourse, Rails API mode)
  const csrfCandidates = [`${baseUrl}/session/csrf`, `${baseUrl}/csrf`];
  for (const csrfUrl of csrfCandidates) {
    try {
      const res = await fetch(csrfUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_SHORT),
      });
      if (res.status === 200) {
        const body = await res.text();
        const csrfMatch = body.match(/"csrf"\s*:\s*"([^"]*)"/);
        if (csrfMatch?.[1]) csrfToken = csrfMatch[1];
        const setCookies: string[] = extractSetCookies(res.headers);
        for (const sc of setCookies) {
          const pair = sc.split(";")[0]?.trim();
          if (pair?.includes("=")) {
            sessionCookie = (sessionCookie ? sessionCookie + "; " : "") + pair;
          }
        }
        if (csrfToken) break;
      }
    } catch { /* skip */ }
  }

  // Step 1b: If no JSON CSRF found, check for HTML form CSRF
  // Try the login page first, then root URL (for apps like Miniflux where GET /login → 405)
  if (!csrfToken) {
    const formCsrfCandidates = detection.csrfFormUrl
      ? [`${baseUrl}${detection.csrfFormUrl}`]
      : [loginUrl, `${baseUrl}/`];
    for (const formUrl of formCsrfCandidates) {
      try {
        const res = await fetch(formUrl, {
          method: "GET",
          headers: { Accept: "text/html, */*" },
          redirect: "follow",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_SHORT),
        });
        if (res.status === 200) {
          const body = await res.text();
          // Look for hidden CSRF inputs in the HTML
          const csrfInputMatch = body.match(/<input[^>]+name=["'](csrf|csrfmiddlewaretoken|_token|authenticity_token|_csrf_token|csrfToken)[^"']*["'][^>]*value=["']([^"']+)["']/i)
            || body.match(/<input[^>]+value=["']([^"']+)["'][^>]+name=["'](csrf|csrfmiddlewaretoken|_token|authenticity_token|_csrf_token|csrfToken)[^"']*["']/i);
          if (csrfInputMatch) {
            // The regex may capture groups in different orders depending on which pattern matched
            if (csrfInputMatch[2] && /^(csrf|csrfmiddlewaretoken|_token|authenticity_token|_csrf_token|csrfToken)$/i.test(csrfInputMatch[1]!)) {
              csrfFieldName = csrfInputMatch[1]!;
              csrfToken = csrfInputMatch[2];
            } else {
              csrfToken = csrfInputMatch[1]!;
              csrfFieldName = csrfInputMatch[2]!;
            }
          }
          // Also grab session cookie from this page (needed to pair with the CSRF token)
          const setCookies: string[] = extractSetCookies(res.headers);
          for (const sc of setCookies) {
            const pair = sc.split(";")[0]?.trim();
            if (pair?.includes("=")) {
              sessionCookie = (sessionCookie ? sessionCookie + "; " : "") + pair;
            }
          }
          if (csrfToken) break;
        }
      } catch { /* skip */ }
    }
  }

  // Step 2: Attempt login with form-encoded body (most common for session auth)
  // Include CSRF token in the body if it came from an HTML form, or as header if from JSON API
  let formBody = `login=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}`;
  if (csrfToken && csrfFieldName) {
    // HTML form CSRF — include in POST body
    formBody = `${csrfFieldName}=${encodeURIComponent(csrfToken)}&${formBody}`;
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (csrfToken && !csrfFieldName) headers["X-CSRF-Token"] = csrfToken;
  if (sessionCookie) headers["Cookie"] = sessionCookie;

  try {
    const res = await fetch(loginUrl, {
      method: "POST",
      headers,
      body: formBody,
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_DEFAULT),
    });
    const body = await res.text();

    if (res.status >= 500) {
      return { valid: false, reason: `Login returned HTTP ${res.status} — app may be broken` };
    }

    // Check for error indicators in the response body
    const isNotActivated = /not.activated|not.verified|email.confirm|must.confirm|activation.required|verify.your.email/i.test(body);
    if (isNotActivated) {
      const preview = body.length > 200 ? body.slice(0, 200) + "..." : body;
      return { valid: false, reason: `not_activated: ${preview}` };
    }
    if (/\b(error|invalid|incorrect|wrong|failed|denied)\b/i.test(body) && !/"current_user"/.test(body)) {
      const preview = body.length > 200 ? body.slice(0, 200) + "..." : body;
      return { valid: false, reason: `Login rejected credentials: ${preview}` };
    }

    // Check for success indicators
    if (res.status === 200 || res.status === 302) {
      // Look for session cookies in response
      const setCookies: string[] = extractSetCookies(res.headers);
      const hasSessionCookie = setCookies.some(
        (c: string) => /(_t|_session|session_id|token|jwt|Session)/i.test(c),
      );
      if (hasSessionCookie || res.status === 302) {
        // Step 3: Verify the session actually works by hitting a protected resource
        // This catches the case where login returns 302 but CSRF was missing (session not created)
        if (detection.protectedEndpointPath || detection.csrfRequired) {
          const verifyCookie = setCookies.map(c => c.split(";")[0]?.trim()).filter(Boolean).join("; ")
            || sessionCookie || "";
          const verifyUrl = detection.protectedEndpointPath
            ? `${baseUrl}${detection.protectedEndpointPath}`
            : `${baseUrl}/`;
          try {
            const verifyRes = await fetch(verifyUrl, {
              method: "GET",
              headers: { Accept: "text/html, application/json, */*", Cookie: verifyCookie },
              redirect: "follow",
              signal: AbortSignal.timeout(FETCH_TIMEOUT_SHORT),
            });
            const verifyBody = await verifyRes.text();
            // If the protected resource still shows a login form, auth didn't actually work
            const stillShowsLogin = /<form[^>]*action=["'][^"']*login/i.test(verifyBody)
              || /<input[^>]+name=["']password["']/i.test(verifyBody)
              || /Sign\s*In|Log\s*In/i.test(verifyBody.slice(0, 500));
            if (stillShowsLogin && verifyRes.status === 200) {
              return { valid: false, reason: "Login returned 302 but session was NOT authenticated — protected resource still shows login form (likely missing CSRF token in login POST)" };
            }
          } catch { /* verification fetch failed — don't block on this */ }
        }
        return { valid: true, reason: "Login succeeded with session cookie" };
      }
      // 200 without session cookie — might be an error-in-200 we didn't catch
      if (/"user"/.test(body) || /"username"/.test(body)) {
        return { valid: true, reason: "Login returned user data" };
      }
    }

    // Unhandled 4xx — credentials are likely invalid
    if (res.status >= 400) {
      return { valid: false, reason: `Login returned HTTP ${res.status}` };
    }

    return { valid: true, reason: `Login returned HTTP ${res.status} — assuming OK` };
  } catch (err) {
    return { valid: false, reason: `Login request failed: ${toErrorMessage(err)}` };
  }
}

// ---------------------------------------------------------------------------
// probe_url — HTTP probe for auth configuration LLM
// Cookie jar persists cookies across probeUrl calls within a single auth phase.
// ---------------------------------------------------------------------------

let _probeCookieJar: Record<string, string> = {};

async function probeUrl(args: Record<string, unknown>): Promise<string> {
  const url = String(args.url ?? "");
  const method = String(args.method ?? "GET").toUpperCase();

  let extraHeaders: Record<string, string> = {};
  if (args.headers) {
    try {
      extraHeaders = JSON.parse(String(args.headers));
    } catch {
      return "Error: invalid JSON in headers parameter";
    }
  }

  // Build Cookie header from stored jar (explicit headers take precedence)
  const jarCookieStr = Object.entries(_probeCookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  const fetchOpts: RequestInit = {
    method,
    headers: {
      Accept: "application/json, text/html, */*",
      ...(jarCookieStr && !extraHeaders.Cookie && !extraHeaders.cookie
        ? { Cookie: jarCookieStr }
        : {}),
      ...extraHeaders,
    },
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_LONG),
  };

  if (args.body && (method === "POST" || method === "PUT")) {
    fetchOpts.body = String(args.body);
  }

  try {
    console.log(`[Auth] Probing ${method} ${url}`);
    const res = await fetch(url, fetchOpts);

    // Store cookies from set-cookie response headers
    try {
      const setCookies: string[] =
        extractSetCookies(res.headers);
      for (const sc of setCookies) {
        const pair = sc.split(";")[0]?.trim();
        if (pair) {
          const eqIdx = pair.indexOf("=");
          if (eqIdx > 0) {
            _probeCookieJar[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
          }
        }
      }
    } catch {
      /* ignore cookie parse errors */
    }

    const status = res.status;
    const headerLines: string[] = [];
    for (const [k, v] of res.headers.entries()) {
      // Only include useful headers
      const lk = k.toLowerCase();
      if (
        lk === "content-type" ||
        lk === "location" ||
        lk === "set-cookie" ||
        lk === "x-csrf-token" ||
        lk === "www-authenticate" ||
        lk.startsWith("x-discourse")
      ) {
        headerLines.push(`${k}: ${v}`);
      }
    }

    const bodyText = await res.text().catch(() => "");
    const bodyPreview =
      bodyText.length > 2000
        ? bodyText.slice(0, 2000) + "\n... [truncated]"
        : bodyText;

    const parts = [`HTTP ${status}`];
    if (headerLines.length > 0) parts.push(headerLines.join("\n"));

    // Detect when endpoint returns HTML instead of JSON — common in
    // setup wizards, SPAs, and apps that serve a catch-all HTML shell
    const contentType = res.headers.get("content-type") ?? "";
    const acceptHeader = (fetchOpts.headers as Record<string, string>)?.Accept ?? "";
    if (
      contentType.includes("text/html") &&
      acceptHeader.includes("application/json") &&
      bodyText.includes("<html")
    ) {
      parts.push(
        "⚠️ NOTE: This endpoint returned HTML content even though JSON was requested. " +
        "This likely means the app is serving a catch-all page (setup wizard, SPA shell, or error page) " +
        "rather than an actual API response. This does NOT indicate the endpoint is unprotected.",
      );
    }

    parts.push(bodyPreview || "(empty body)");

    // Save full body to file when truncated — LLM can read_file for details
    const savedPath = saveProbeBody(bodyText, contentType);
    if (savedPath) {
      parts.push(`\n📄 Full response body (${bodyText.length} bytes) saved to: ${savedPath}\nUse read_file to inspect for errors, setup instructions, or configuration requirements.`);
    }

    console.log(`[Auth] Probe result: ${status}`);
    return parts.join("\n\n");
  } catch (err) {
    const msg = toErrorMessage(err);
    return `Error: ${msg}`;
  }
}

// ---------------------------------------------------------------------------
// Cookie jar / probeUrl helpers
// ---------------------------------------------------------------------------
