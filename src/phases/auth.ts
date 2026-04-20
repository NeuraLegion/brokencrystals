import type OpenAI from "openai";
import type { TechStack, BrightApiContext } from "../types.js";
import type { BrightMcpClient } from "../mcp-client.js";
import type { ChatCompletionTool } from "openai/resources/chat/completions.mjs";
import { execSync } from "child_process";
import { chatWithTools, type ToolHandler } from "../inference.js";
import {
  codebaseTools,
  createToolHandler,
  convertMcpToolsToOpenAI,
  createMcpToolHandler,
  webSearchTools,
  createWebSearchHandler,
} from "../tools.js";
import { formatTechStack, extractJson, runShellCommand, toErrorMessage } from "../utils.js";
import { detectAuthPrompt, configureAuthPrompt, seedUserPrompt } from "../prompts/auth.js";

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
}

export interface AuthTestResult {
  passed: boolean;
  summary: string;
}

/**
 * Detects the application's authentication mechanism by analyzing source code,
 * then creates a Bright auth object using the LLM + Bright MCP tools.
 *
 * Phase 1 (code analysis): LLM reads the codebase to detect auth type,
 *   credentials, registration flow, etc.
 * Phase 2 (local registration): Directly registers a test user if needed.
 * Phase 3 (MCP-driven auth setup): LLM uses Bright MCP tools (addAuth,
 *   editAuth, getAuth, listAuths) to create and iteratively fix the auth
 *   object, seeing full test feedback at each step.
 */
export async function detectAndConfigureAuth(
  llm: OpenAI,
  bright: BrightMcpClient,
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
    }
  }

  // Phase 4: Let the LLM create + test + fix the auth object via MCP tools
  //   Pre-probe the app to give the LLM real data instead of forcing it to guess
  const probeContext = await preProbeForAuth(baseUrl, detection);

  // Phase 4.5: Sanity-check the login endpoint before burning LLM turns
  const loginCheck = await preAuthLoginSanityCheck(baseUrl, detection);
  if (!loginCheck.functional) {
    console.error("[Auth] Aborting auth: login endpoint is broken (HTTP 5xx)");
    return {
      authObjectId: undefined,
      hasAuth: false,
      authFailed: true,
      registration: undefined,
    };
  }

  const MAX_AUTH_ATTEMPTS = 3;
  let authObjectId: string | undefined;
  const allAttemptLogs: string[] = [];
  // Include login sanity diagnostics in the probe context for the LLM
  const fullProbeContext = loginCheck.diagnostic
    ? probeContext + "\n\n" + loginCheck.diagnostic
    : probeContext;

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
      bright,
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
          contentType: detection.loginContentType,
        }
      : undefined;

  if (authObjectId) {
    console.log(`[Auth] Auth configured successfully: ${authObjectId}`);
    return { authObjectId, hasAuth: true, authFailed: false, registration };
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
      notes: parsed.notes ?? "",
    };
  } catch {
    console.warn(
      "[Auth] Could not parse detection response:",
      response.slice(0, 300),
    );
    return {
      requiresAuth: false,
      authType: "none",
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
      notes: "Detection failed",
    };
  }
}

// ---------------------------------------------------------------------------
// Phase 3: LLM-driven auth configuration via custom + MCP tools
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

  // reauthTriggers — default to "both" for session (status OR redirect), status for JWT
  const reauthStrat = params.reauthStrategy ?? (isSession ? "both" : "status");
  let reauthTriggers: Record<string, unknown>[];
  if (reauthStrat === "body" && params.reauthBodyPattern) {
    reauthTriggers = [
      { type: "TRIGGER", location: "body", patterns: [params.reauthBodyPattern] },
    ];
  } else if (reauthStrat === "redirect") {
    reauthTriggers = [
      { type: "TRIGGER", location: "header", name: "Location", patterns: ["login"] },
    ];
  } else if (reauthStrat === "both") {
    reauthTriggers = [
      { type: "TRIGGER", location: "status", statuses: [401, 403] },
      { type: "OR" },
      { type: "TRIGGER", location: "header", name: "Location", patterns: ["login"] },
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
  if (params.csrfUrl && !params.csrfExtractPattern) {
    const detectedPattern = await autoProbeCsrf(params.csrfUrl);
    if (detectedPattern) {
      params.csrfExtractPattern = detectedPattern;
    }
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
        // Test request should follow redirects normally — only login steps
        // need followRedirects:false to capture raw Set-Cookie on 302
      },
    },
    successResponseDetection: [{ type: "status", statuses: [200] }],
    reauthTriggers,
    config: {
      multistep: {
        steps: buildLoginSteps({
          csrfUrl: params.csrfUrl,
          csrfHeaderName: params.csrfHeaderName,
          csrfExtractPattern: params.csrfExtractPattern,
          loginUrl,
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
    `[Auth] Creating ${authStyle} auth via REST API — login: ${loginUrl}, test: ${testUrl}${params.csrfUrl ? `, csrf: ${params.csrfUrl}` : ""}${params.csrfExtractPattern ? `, csrfPattern: ${params.csrfExtractPattern}` : ""}`,
  );
  return postAuthObject(api, body);
}

/**
 * Build the multistep login steps array. When csrfUrl is provided, prepends
 * a GET step that fetches a CSRF token and injects it into the POST login step
 * via NexTemplate.
 */
function buildLoginSteps(opts: {
  csrfUrl?: string;
  csrfHeaderName?: string;
  csrfExtractPattern?: string;
  loginUrl: string;
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
        ...opts.redirectOpts,
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
  bright: BrightMcpClient,
  repoPath: string,
  detection: AuthDetection,
  registrationOk: boolean,
  projectId: string,
  baseUrl: string,
  repeaterId: string,
  api: BrightApiContext,
  model?: string,
  preProbeContext?: string,
): Promise<{ authId: string | undefined; attemptLog: string[] }> {
  // MCP tools for inspection only (listAuths, getAuth)
  _probeCookieJar = {};
  const mcpSchemas = await bright.getMcpToolSchemas(["getAuth", "listAuths"]);
  const mcpToolsDefs = convertMcpToolsToOpenAI(mcpSchemas);
  const mcpHandler = createMcpToolHandler(bright);

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
                "(Session auth) URL that returns a CSRF token in JSON body. The token is extracted via regex and sent as X-CSRF-Token header on the login request. E.g. http://localhost:3000/session/csrf. IMPORTANT: probe_url the csrfUrl first to verify the response body format, then set csrfExtractPattern if the default regex doesn't match.",
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
        name: "test_auth_object",
        description:
          "Test a Bright auth object. Runs the login flow and checks if authentication + authorization succeed. Returns stage-by-stage results with pass/fail status and error messages.",
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
    {
      type: "function",
      function: {
        name: "run_command_on_host",
        description:
          "Run a shell command on the HOST machine. Use for docker ps, docker logs, curl, and other host-level diagnostics. Commands are killed after 30 seconds.",
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description:
                'Host shell command (e.g. "docker ps --format \'{{.ID}} {{.Image}}\'", "curl -v http://localhost:3000/session/csrf")',
            },
          },
          required: ["command"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "run_command_in_docker",
        description:
          "Run a command INSIDE a Docker container. Use to create test users (rails runner, python manage.py), inspect the app environment, or run framework CLI commands. Commands are killed after 30 seconds.",
        parameters: {
          type: "object",
          properties: {
            container: {
              type: "string",
              description:
                'Container name or ID (e.g. "bright-app-local", "abc123")',
            },
            command: {
              type: "string",
              description:
                'Command to run inside the container (e.g. "rails runner \'User.create!(...)\'", "python manage.py createsuperuser --noinput")',
            },
          },
          required: ["container", "command"],
          additionalProperties: false,
        },
      },
    },
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
    if (name === "test_auth_object") {
      const result = await testAuthObject(
        api,
        String(args.authObjectId),
      );
      // Log the test result with the create_auth params that produced this auth object
      const summary = JSON.stringify(result);
      const configSummary = `loginUrl=${lastCreateArgs.loginUrl}, testUrl=${lastCreateArgs.testUrl}, authStyle=${lastCreateArgs.authStyle}, reauthStrategy=${lastCreateArgs.reauthStrategy ?? "default"}, csrfUrl=${lastCreateArgs.csrfUrl ?? "none"}`;
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
    if (name === "run_command" || name === "run_command_on_host") {
      const cmd = String(args.command ?? "");
      console.log(`[Auth] run_command_on_host: ${cmd.slice(0, 200)}`);
      return runShellCommand(repoPath, cmd);
    }
    if (name === "run_command_in_docker") {
      const container = String(args.container ?? "");
      const cmd = String(args.command ?? "");
      console.log(`[Auth] run_command_in_docker [${container}]: ${cmd.slice(0, 200)}`);
      const isRunning = (() => {
        try {
          const out = execSync(
            `docker inspect --format='{{.State.Running}}' ${JSON.stringify(container)} 2>/dev/null`,
            { encoding: "utf-8", timeout: 5_000 },
          ).trim();
          return out === "true";
        } catch {
          return false;
        }
      })();
      const dockerCmd = isRunning
        ? `docker exec ${JSON.stringify(container)} sh -c ${JSON.stringify(cmd)}`
        : `docker run --rm ${JSON.stringify(container)} sh -c ${JSON.stringify(cmd)}`;
      return runShellCommand(repoPath, dockerCmd);
    }
    return `Unknown tool: ${name}`;
  };

  const webHandler = createWebSearchHandler(repoPath);
  const combinedHandler: ToolHandler = async (name, args) => {
    if (
      name === "create_auth" ||
      name === "test_auth_object" ||
      name === "delete_auth_object" ||
      name === "probe_url" ||
      name === "run_command" ||
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
    return mcpHandler(name, args);
  };

  const baseCodeHandler = createToolHandler(repoPath);
  const allTools = [...codebaseTools, ...mcpToolsDefs, ...customTools, ...webSearchTools];

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
  const authId = parseAuthResponse(trimmed);
  if (!authId) {
    console.error(`[Auth] LLM could not configure auth (response: ${trimmed.slice(0, 200)})`);
  }
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
      signal: AbortSignal.timeout(15_000),
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
      signal: AbortSignal.timeout(15_000),
    });
    console.log(`[Auth] Re-registration response: ${res.status}`);
  } catch (err) {
    console.warn(
      `[Auth] Re-registration failed (user may already exist): ${err}`,
    );
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
): Promise<SeedUserResult | undefined> {
  console.log("[Auth] Starting seed user sub-phase...");

  const seedTools: ChatCompletionTool[] = [
    ...codebaseTools,
    ...webSearchTools,
    {
      type: "function",
      function: {
        name: "run_command_on_host",
        description:
          "Run a shell command on the HOST machine. Use for docker ps, docker logs, and host-level diagnostics. Timeout: 60 seconds.",
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: 'Host shell command (e.g. "docker ps --format \'{{.ID}} {{.Image}}\'")',
            },
          },
          required: ["command"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "run_command_in_docker",
        description:
          "Run a command INSIDE a Docker container. Use to create test users via framework CLI (rails runner, python manage.py, etc.). Timeout: 60 seconds.",
        parameters: {
          type: "object",
          properties: {
            container: {
              type: "string",
              description: 'Container name or ID (e.g. "bright-app-local", "abc123")',
            },
            command: {
              type: "string",
              description: 'Command to run inside the container (e.g. "rails runner \'User.create!(...)\'", "python manage.py createsuperuser")',
            },
          },
          required: ["container", "command"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "probe_url",
        description:
          "Make an HTTP request to the running app. Use to verify the user was created by testing login.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "Full URL to probe" },
            method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"], description: "HTTP method. Default: GET" },
            headers: { type: "string", description: 'JSON headers, e.g. \'{"Content-Type":"application/json"}\'' },
            body: { type: "string", description: "Request body for POST/PUT" },
          },
          required: ["url"],
          additionalProperties: false,
        },
      },
    },
  ];

  const baseCodeHandler = createToolHandler(repoPath);
  const seedWebHandler = createWebSearchHandler(repoPath);
  const handler: ToolHandler = async (name, args) => {
    if (name === "run_command" || name === "run_command_on_host") {
      const cmd = String(args.command ?? "");
      console.log(`[Auth:Seed] run_command_on_host: ${cmd.slice(0, 200)}`);
      return runShellCommand(repoPath, cmd);
    }
    if (name === "run_command_in_docker") {
      const container = String(args.container ?? "");
      const cmd = String(args.command ?? "");
      console.log(`[Auth:Seed] run_command_in_docker [${container}]: ${cmd.slice(0, 200)}`);
      const isRunning = (() => {
        try {
          const out = execSync(
            `docker inspect --format='{{.State.Running}}' ${JSON.stringify(container)} 2>/dev/null`,
            { encoding: "utf-8", timeout: 5_000 },
          ).trim();
          return out === "true";
        } catch {
          return false;
        }
      })();
      const dockerCmd = isRunning
        ? `docker exec ${JSON.stringify(container)} sh -c ${JSON.stringify(cmd)}`
        : `docker run --rm ${JSON.stringify(container)} sh -c ${JSON.stringify(cmd)}`;
      return runShellCommand(repoPath, dockerCmd);
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
  const response = await chatWithTools(llm, messages, seedTools, handler, model, 30);

  try {
    const json = extractJson(response);
    const result = JSON.parse(json) as SeedUserResult;
    if (result.success) {
      console.log(`[Auth:Seed] User created: ${result.username} / ${result.email}`);
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
        signal: AbortSignal.timeout(120_000),
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

      const results = (await res.json()) as Array<{
        stage: string;
        status: string;
        message?: string;
      }>;

      if (results.length === 0) {
        return { passed: false, summary: "No results returned" };
      }

      const lines = results.map(
        (r) =>
          `stage=${r.stage} status=${r.status}${r.message ? ` — ${r.message}` : ""}`,
      );
      for (const l of lines) console.log(`[Auth] Test: ${l}`);

      const allPassed = results.every((r) => r.status === "success");
      return { passed: allPassed, summary: lines.join("\n") };
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
  // Extract auth object ID from response (may be a UUID or hex string)
  const idMatch = trimmed.match(/[0-9a-f]{24}|[0-9a-f-]{36}/i);
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
      signal: AbortSignal.timeout(10_000),
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
      // Not JSON — try HTML meta tag pattern
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
          signal: AbortSignal.timeout(8_000),
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
        signal: AbortSignal.timeout(8_000),
      });
      const getBody = await getRes.text();
      const ct = getRes.headers.get("content-type") ?? "";
      const isHtml = ct.includes("html") || getBody.trimStart().startsWith("<");
      const preview = getBody.length > 1000 ? getBody.slice(0, 1000) + "..." : getBody;
      const loginType = isHtml ? "HTML page (NOT an API endpoint)" : "API endpoint";
      lines.push(`### Login endpoint probe: GET ${loginUrl} → ${getRes.status} (${loginType})\nContent-Type: ${ct}\n\`\`\`\n${preview}\n\`\`\``);

      // If it's HTML, look for form action to find the real API endpoint
      if (isHtml) {
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
              signal: AbortSignal.timeout(8_000),
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
        signal: AbortSignal.timeout(8_000),
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
          signal: AbortSignal.timeout(8_000),
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
            (res.headers as any).getSetCookie?.() ?? [];
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
        signal: AbortSignal.timeout(10_000),
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
    signal: AbortSignal.timeout(15_000),
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
        (res.headers as any).getSetCookie?.() ?? [];
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
    // Truncate body but keep enough context
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
