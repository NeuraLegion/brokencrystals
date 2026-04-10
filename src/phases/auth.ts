import type OpenAI from "openai";
import type { TechStack, DiscoveredEndpoint } from "../types.js";
import type { BrightMcpClient } from "../mcp-client.js";
import { chatWithTools } from "../inference.js";
import { codebaseTools, createToolHandler } from "../tools.js";
import { formatTechStack, extractJson } from "../utils.js";

export interface AuthResult {
  /** Single auth object ID for the whole app, or undefined if no auth. */
  authObjectId: string | undefined;
  /** True if auth was successfully configured. */
  hasAuth: boolean;
  /** True if auth was detected as required but could not be configured. */
  authFailed: boolean;
}

/**
 * Detects the application's authentication mechanism by analyzing source code,
 * then creates (or reuses) a single Bright auth object for the whole app.
 */
export async function detectAndConfigureAuth(
  llm: OpenAI,
  bright: BrightMcpClient,
  repoPath: string,
  techStack: TechStack,
  endpoints: DiscoveredEndpoint[],
  projectId: string,
  baseUrl: string,
  repeaterId: string,
  brightToken: string,
  brightHostname: string,
): Promise<AuthResult> {
  const MAX_AUTH_ATTEMPTS = 10;

  // Step 1: Detect auth from source code using the LLM
  let detection = await detectAuthFromCode(llm, repoPath, techStack, endpoints, baseUrl);

  if (!detection.requiresAuth) {
    console.log("[Auth] No auth required");
    return { authObjectId: undefined, hasAuth: false, authFailed: false };
  }

  console.log(`[Auth] Detected auth: ${detection.authType} — ${detection.notes}`);
  console.log(`[Auth] tokenLocation=${detection.tokenLocation}, tokenFieldPath=${detection.tokenFieldPath}, loginEndpoint=${detection.loginEndpoint}, protectedEndpoint=${detection.protectedEndpointPath}`);
  console.log(`[Auth] loginContentType=${detection.loginContentType}, tokenEmbedLocation=${detection.tokenEmbedLocation}, cookieName=${detection.cookieName}, queryParam=${detection.queryParamName}`);

  // Step 2: Check for existing auth objects we can reuse
  const existingAuth = await findExistingAuth(bright, projectId, detection);
  if (existingAuth) {
    console.log(`[Auth] Reusing existing auth object: ${existingAuth}`);
    return { authObjectId: existingAuth, hasAuth: true, authFailed: false };
  }

  // Step 3-4: Create and test — retry on failure
  for (let attempt = 1; attempt <= MAX_AUTH_ATTEMPTS; attempt++) {
    console.log(`[Auth] Attempt ${attempt}/${MAX_AUTH_ATTEMPTS}`);

    const authObjectId = await createAuthObject(
      brightToken, brightHostname, projectId, baseUrl, repeaterId, detection,
    );

    if (!authObjectId) {
      console.error(`[Auth] Attempt ${attempt}: Failed to create auth object`);
      if (attempt < MAX_AUTH_ATTEMPTS) {
        detection = await retryDetection(llm, repoPath, techStack, endpoints, baseUrl, detection, "Auth object creation failed. The API rejected the configuration.");
        continue;
      }
      return { authObjectId: undefined, hasAuth: false, authFailed: true };
    }

    console.log(`[Auth] Created auth object: ${authObjectId}`);

    // Test the auth object
    const testResult = await testAuthObject(brightToken, brightHostname, authObjectId);
    if (testResult.passed) {
      console.log(`[Auth] Auth test passed: ${testResult.summary}`);
      return { authObjectId, hasAuth: true, authFailed: false };
    }

    console.warn(`[Auth] Attempt ${attempt}: Auth test failed — ${testResult.summary}`);

    if (attempt < MAX_AUTH_ATTEMPTS) {
      await deleteAuthObject(brightToken, brightHostname, authObjectId);
      detection = await retryDetection(
        llm, repoPath, techStack, endpoints, baseUrl, detection,
        `Auth object test failed. Test results:\n${testResult.summary}\n\nThe credentials or configuration are likely wrong. Re-examine the codebase for correct values.`,
      );
    }
  }

  console.error("[Auth] All auth attempts failed — cannot proceed");
  return { authObjectId: undefined, hasAuth: false, authFailed: true };
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
  notes: string;
}

async function detectAuthFromCode(
  llm: OpenAI,
  repoPath: string,
  techStack: TechStack,
  endpoints: DiscoveredEndpoint[],
  baseUrl: string,
): Promise<AuthDetection> {
  const stackStr = formatTechStack(techStack);
  const endpointSummary = endpoints
    .map((ep) => `${ep.method} ${ep.path} (${ep.filePath})`)
    .join("\n");

  const handler = createToolHandler(repoPath);

  const messages: Parameters<typeof chatWithTools>[1] = [
    {
      role: "system",
      content: `You are a security analyst examining a ${stackStr} application. Your task is to determine how the app authenticates users and extract the exact details needed to configure a DAST scanner.

You have codebase tools (read_file, list_files, search_files) to analyze source code.

STEP 1 — Find the login endpoint:
- Search for auth controllers, login routes, sign-in handlers
- Read the login handler to find the exact request body field names (e.g. "user", "email", "username")
- IMPORTANT: Read the login CONTROLLER/HANDLER code (not just the service) and check HOW the token is returned:
  a) Does the handler call res.set(), res.header(), response.header(), or set a header like "authorization"? → tokenLocation = "header", tokenFieldPath = the header name in lowercase (e.g. "authorization")
  b) Does the handler return a JSON body containing a token field (e.g. { token: jwt })? → tokenLocation = "body", tokenFieldPath = the field name
  c) If the handler calls something like res.header('authorization', token) or response.set('authorization', ...), that means tokenLocation = "header", NOT "body"
- You MUST search for "res.header", "res.set", "response.header", "setHeader" in the auth controller to check this

STEP 2 — Find REAL credentials (THIS IS CRITICAL):
You MUST actually read these files to find credentials. Do NOT skip this step:
1. search_files for "password" in docker-compose*.yml, .env*, seed*, fixture*, init*
2. Read docker-compose.yml — look for environment variables with DEFAULT_USER, ADMIN_PASSWORD, etc.
3. Read .env, .env.example, .env.local, .env.development — look for user/password values
4. search_files for "createUser", "insert.*user", "seed", "admin" in *.ts, *.js, *.sql files
5. Read any seed/migration/fixture files you find
6. Read README.md — look for default credentials section
7. search_files for "password" or "credentials" in config files

If you cannot find credentials after reading ALL of the above, set loginBody to null.
NEVER invent credentials. NEVER use "admin@example.com", "correctpassword", "admin123", "password123", or any other made-up value.
Only use credentials you found by reading actual files in the codebase.

STEP 3 — Find the exact JSON field names for the login request body:
- Read the DTO/schema/validation for the login endpoint
- The field names might be "user", "email", "username", "login" — use EXACTLY what the code expects
- The password field might be "password", "pass", "passwd" — use EXACTLY what the code expects

Base URL: ${baseUrl}`,
    },
    {
      role: "user",
      content: `Analyze the authentication for this app.

Known endpoints (these are REAL endpoints that exist in the app):
${endpointSummary}

You MUST search the codebase and READ files before answering. Do NOT guess — actually look at the code.

Return ONLY a JSON object with these exact fields:
{
  "requiresAuth": true/false,
  "authType": "jwt" | "session" | "api_key" | "basic" | "oauth" | "none",
  "loginEndpoint": "/api/auth/login" or null,
  "loginMethod": "POST" or null,
  "loginBody": "{\\"user\\":\\"actual-user-from-code\\",\\"password\\":\\"actual-pass-from-code\\"}" or null,
  "loginContentType": "json" | "form" | "xml",
  "tokenLocation": "body" | "header" | "cookie",
  "tokenFieldPath": "token" or "authorization" or "session_id" or null,
  "tokenEmbedLocation": "header" | "cookie" | "query",
  "headerName": "Authorization" or "X-API-Key" or null,
  "headerPrefix": "Bearer " or "" or null,
  "cookieName": "session" or "JSESSIONID" or null,
  "queryParamName": "token" or "api_key" or null,
  "reauthIndicator": "status" | "redirect" | "body",
  "reauthBodyPattern": "regex pattern" or null,
  "protectedEndpointPath": "/api/some/protected/path" or null,
  "notes": "brief description including where you found the credentials"
}

CRITICAL RULES:
- "loginBody" field names MUST match what the login endpoint handler expects (read the code!)
- "loginBody" credential values MUST come from seed data, env vars, docker-compose, or code you actually read
- If you cannot find real credentials, set "loginBody" to null — do NOT invent values
- "loginContentType": "json" for JSON APIs, "form" for HTML form login (application/x-www-form-urlencoded), "xml" for SOAP/XML auth
- "tokenLocation": "body" if token is in JSON response body, "header" if in a response header, "cookie" if set via Set-Cookie. READ THE LOGIN HANDLER CODE!
- "tokenFieldPath": for body → dot-path to the token field. For header → header name in lowercase. For cookie → cookie name.
- "tokenEmbedLocation": "header" for Authorization/Bearer, "cookie" if the app reads auth from cookies, "query" if token goes in URL query params
- "cookieName": set this if tokenEmbedLocation is "cookie" — the cookie name the app expects
- "queryParamName": set this if tokenEmbedLocation is "query" — the query param name
- "reauthIndicator": How the app signals an expired/invalid session:
  - "status" → returns 401/403 status codes (most common for APIs)
  - "redirect" → returns 301/302 redirect to a login page (common for web apps with server-side rendering)
  - "body" → returns 200 OK but with an error message in the response body (common for GraphQL or apps that don't use proper HTTP status codes)
- "reauthBodyPattern": Only set when reauthIndicator is "body". A regex pattern that matches the body content indicating auth failure (e.g. "session.expired|login.required|unauthorized"). Set to null for "status" or "redirect".
- "protectedEndpointPath" MUST be an endpoint that RETURNS 401 or 403 when accessed WITHOUT the auth token. To verify this:
  1. Pick a candidate from the Known endpoints list above
  2. STRONGLY PREFER endpoints with NO path parameters (no :id, :email, etc.) — e.g. /api/users/me is better than /api/users/:id
  3. Read its route definition and handler code
  4. Confirm it has auth middleware/guard applied (e.g. @UseGuards, passport.authenticate, jwt required, AuthGuard, etc.)
  5. If the route has NO auth guard or the guard is optional, pick a DIFFERENT endpoint
  5. Do NOT pick endpoints that return 200 for unauthenticated requests (e.g. public pages, public APIs)
  6. Do NOT invent endpoints — pick from the list above`,
    },
  ];

  const response = await chatWithTools(llm, messages, codebaseTools, handler, undefined, 40);

  try {
    const parsed = JSON.parse(extractJson(response));
    return {
      requiresAuth: parsed.requiresAuth ?? false,
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
      notes: parsed.notes ?? "",
    };
  } catch {
    console.warn("[Auth] Could not parse detection response:", response.slice(0, 300));
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
      notes: "Detection failed",
    };
  }
}

// ---------------------------------------------------------------------------
// Step 2: Check for reusable existing auth objects
// ---------------------------------------------------------------------------

async function findExistingAuth(
  bright: BrightMcpClient,
  projectId: string,
  detection: AuthDetection,
): Promise<string | undefined> {
  try {
    const existing = await bright.listAuths(projectId);
    if (existing.length === 0) return undefined;

    // Look for an auth object that matches our detected type
    const typeMap: Record<string, string> = {
      jwt: "multistep",
      session: "multistep",
      api_key: "header",
      basic: "header",
      oauth: "oidc",
    };
    const expectedBrightType = typeMap[detection.authType] ?? "multistep";

    const match = existing.find((a) => a.type === expectedBrightType);
    return match?.id;
  } catch (err) {
    console.warn(`[Auth] Failed to list existing auth objects: ${err}`);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Step 3: Create auth object programmatically
// ---------------------------------------------------------------------------

async function createAuthObject(
  brightToken: string,
  brightHostname: string,
  projectId: string,
  baseUrl: string,
  repeaterId: string,
  detection: AuthDetection,
): Promise<string | undefined> {
  const {
    authType, loginEndpoint, loginMethod, loginBody, loginContentType,
    tokenLocation, tokenFieldPath, tokenEmbedLocation,
    headerName, headerPrefix, cookieName, queryParamName, protectedEndpointPath,
  } = detection;

  // Build the test request for a known protected endpoint
  // Replace path params like :email, :id with dummy values
  const resolvedPath = protectedEndpointPath
    ? protectedEndpointPath.replace(/:(\w+)/g, "1").replace(/\{(\w+)\}/g, "1")
    : "/";
  const testUrl = `${baseUrl}${resolvedPath}`;

  if (authType === "api_key" || authType === "basic") {
    return createHeaderAuth(
      brightToken, brightHostname, projectId, repeaterId, testUrl, detection,
    );
  }

  // For jwt/session/oauth — use multistep with login flow
  if (!loginEndpoint || !loginBody) {
    console.warn("[Auth] Login endpoint or credentials not found — cannot create auth");
    return undefined;
  }

  const loginUrl = `${baseUrl}${loginEndpoint}`;

  // Build the NexTemplate for token extraction based on tokenLocation
  let template: string;
  if (tokenLocation === "header") {
    const headerKey = (tokenFieldPath ?? "authorization").toLowerCase();
    template = `{{ auth_object.stages.login.response.headers | get: '/${headerKey}' }}`;
  } else if (tokenLocation === "cookie") {
    const cName = tokenFieldPath ?? cookieName ?? "session";
    template = `{{ auth_object.stages.login.response.headers | get: '/set-cookie' | match: /${cName}=([^;]*)/ }}`;
  } else {
    // body
    const tokenRegex = buildTokenRegex(tokenFieldPath ?? "token");
    template = `${headerPrefix ?? "Bearer "}{{ auth_object.stages.login.response.body | match: /${tokenRegex}/ }}`;
  }

  // Determine Content-Type header for the login request
  const contentTypeMap: Record<string, string> = {
    json: "application/json",
    form: "application/x-www-form-urlencoded",
    xml: "application/xml",
  };
  const loginCT = contentTypeMap[loginContentType] ?? "application/json";

  // Build the embedder based on tokenEmbedLocation
  const embedLocation = tokenEmbedLocation ?? "header";
  let embedder: Record<string, unknown>;
  if (embedLocation === "cookie") {
    embedder = {
      type: "cookie" as const,
      name: cookieName ?? "session",
      template,
      templateType: "clear_text",
      mergeStrategy: "replace",
    };
  } else if (embedLocation === "query") {
    embedder = {
      type: "query" as const,
      name: queryParamName ?? "token",
      template,
      templateType: "clear_text",
      mergeStrategy: "replace",
    };
  } else {
    embedder = {
      type: "header" as const,
      name: headerName ?? "Authorization",
      template,
      templateType: "clear_text",
      mergeStrategy: "replace",
    };
  }

  const body = {
    name: `Engine Auth — ${authType}`,
    projectId,
    type: "multistep",
    test: {
      request: { method: "GET", url: testUrl, protocol: "http" },
      repeaterId,
    },
    successResponseDetection: [{ type: "status", statuses: [200] }],
    reauthTriggers: buildReauthTriggers(detection),
    config: {
      multistep: {
        steps: [
          {
            name: "login",
            request: {
              url: loginUrl,
              method: loginMethod ?? "POST",
              protocol: "http",
              headers: [{ name: "Content-Type", value: loginCT, type: "clear_text" }],
              body: loginBody,
              bodyType: "clear_text",
            },
            successResponseDetection: [{ type: "status", statuses: [200, 201] }],
          },
        ],
        embedders: [embedder],
      },
    },
  };

  console.log(`[Auth] Creating multistep auth object via REST API`);
  console.log(`[Auth] Login content type: ${loginCT}, embed: ${embedLocation}`);
  console.log(`[Auth] Embedder template: ${template}`);

  return createAuthViaRest(brightToken, brightHostname, body);
}

async function createHeaderAuth(
  brightToken: string,
  brightHostname: string,
  projectId: string,
  repeaterId: string,
  testUrl: string,
  detection: AuthDetection,
): Promise<string | undefined> {
  const headerValue = detection.loginBody ?? "";
  const body = {
    name: `Engine Auth — ${detection.authType}`,
    projectId,
    type: "header",
    test: {
      request: { method: "GET", url: testUrl },
      repeaterId,
    },
    successResponseDetection: [{ type: "status", statuses: [200] }],
    reauthTriggers: buildReauthTriggers(detection),
    config: {
      request: {
        url: testUrl,
        method: "GET",
        headers: [
          {
            name: detection.headerName ?? "Authorization",
            value: headerValue,
            type: "clear_text",
          },
        ],
      },
    },
  };

  console.log(`[Auth] Creating header auth object via REST API`);
  return createAuthViaRest(brightToken, brightHostname, body);
}

async function createAuthViaRest(
  brightToken: string,
  brightHostname: string,
  body: Record<string, unknown>,
): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://${brightHostname}/api/v3/auth-objects`,
      {
        method: "POST",
        headers: {
          Authorization: `Api-Key ${brightToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[Auth] REST create auth failed: HTTP ${res.status} — ${text.slice(0, 400)}`);
      return undefined;
    }

    const data = (await res.json()) as { id?: string; authObjectId?: string };
    return data.id ?? data.authObjectId;
  } catch (err) {
    console.error(`[Auth] Failed to create auth object: ${err}`);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Step 4: Test the auth object (sync GET with retry)
// ---------------------------------------------------------------------------

export interface AuthTestResult {
  passed: boolean;
  summary: string;
}

export async function testAuthObject(
  brightToken: string,
  brightHostname: string,
  authObjectId: string,
): Promise<AuthTestResult> {
  const base = `https://${brightHostname}`;
  const url = `${base}/api/v3/auth-objects/${encodeURIComponent(authObjectId)}/test`;
  const headers: Record<string, string> = {
    Authorization: `Api-Key ${brightToken}`,
    Accept: "application/json",
  };

  const maxRetries = 5;
  const retryDelayMs = 5_000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[Auth] Testing auth object (attempt ${attempt}/${maxRetries})`);

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
        return { passed: false, summary: `503 after ${maxRetries} retries — ${body.slice(0, 300)}` };
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { passed: false, summary: `HTTP ${res.status} — ${body.slice(0, 400)}` };
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
        (r) => `stage=${r.stage} status=${r.status}${r.message ? ` — ${r.message}` : ""}`,
      );
      for (const l of lines) console.log(`[Auth] Test: ${l}`);

      const allPassed = results.every((r) => r.status === "success");
      return { passed: allPassed, summary: lines.join("\n") };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
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
 * Builds a regex for NexTemplate to extract a token value from a JSON response.
 * Handles dot-paths like "token", "data.accessToken", "auth.jwt.token".
 */
function buildTokenRegex(fieldPath: string): string {
  // For a simple field like "token", match: "token"\s*:\s*"([^"]*)"
  // For nested like "data.accessToken", match the last segment only
  const lastSegment = fieldPath.includes(".")
    ? fieldPath.split(".").pop()!
    : fieldPath;

  // Escape any special regex characters in the field name
  const escaped = lastSegment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `"${escaped}"\\s*:\\s*"([^"]*)"`;
}

/**
 * Build reauth triggers based on what the LLM detected about how the app
 * signals an expired/invalid session.
 */
function buildReauthTriggers(detection: AuthDetection): unknown[] {
  const triggers: unknown[] = [];

  // Always include 401/403 status triggers
  triggers.push({ type: "TRIGGER", location: "status", statuses: [401, 403] });

  const indicator = detection.reauthIndicator ?? "status";

  if (indicator === "redirect") {
    // App redirects to login page on auth failure (e.g. 301/302 to /login)
    triggers.push({ type: "TRIGGER", location: "status", statuses: [301, 302] });
  }

  if (indicator === "body" && detection.reauthBodyPattern) {
    // App returns 200 but body contains an auth-failure message
    triggers.push({
      type: "TRIGGER",
      location: "body",
      pattern: detection.reauthBodyPattern,
    });
  }

  return triggers;
}

// ---------------------------------------------------------------------------
// Retry detection with feedback from the failed attempt
// ---------------------------------------------------------------------------

async function retryDetection(
  llm: OpenAI,
  repoPath: string,
  techStack: TechStack,
  endpoints: DiscoveredEndpoint[],
  baseUrl: string,
  previousDetection: AuthDetection,
  failureReason: string,
): Promise<AuthDetection> {
  console.log(`[Auth] Re-detecting auth after failure: ${failureReason.slice(0, 200)}`);

  const stackStr = formatTechStack(techStack);
  const endpointSummary = endpoints
    .map((ep) => `${ep.method} ${ep.path} (${ep.filePath})`)
    .join("\n");

  const handler = createToolHandler(repoPath);

  const messages: Parameters<typeof chatWithTools>[1] = [
    {
      role: "system",
      content: `You are a security analyst examining a ${stackStr} application.
Your previous auth detection attempt FAILED. You MUST find the correct credentials this time.

Base URL: ${baseUrl}

PREVIOUS (FAILED) DETECTION:
${JSON.stringify(previousDetection, null, 2)}

FAILURE REASON:
${failureReason}

INSTRUCTIONS:
- Search the codebase again MORE THOROUGHLY for the correct credentials
- Check .env, .env.example, docker-compose.yml, seed files, README, test fixtures
- Look for user creation code, default passwords, hardcoded credentials
- The previous loginBody was likely WRONG — find the real one
- Pay special attention to the exact field names in the login request body`,
    },
    {
      role: "user",
      content: `The previous auth configuration failed. Re-examine the codebase and find the CORRECT credentials.

Known endpoints (these are REAL endpoints that exist in the app):
${endpointSummary}

Return ONLY a JSON object with these exact fields:
{
  "requiresAuth": true/false,
  "authType": "jwt" | "session" | "api_key" | "basic" | "oauth" | "none",
  "loginEndpoint": "/api/auth/login" or null,
  "loginMethod": "POST" or null,
  "loginBody": "{\\"user\\":\\"actual-user-from-code\\",\\"password\\":\\"actual-pass-from-code\\"}" or null,
  "loginContentType": "json" | "form" | "xml",
  "tokenLocation": "body" | "header" | "cookie",
  "tokenFieldPath": "token" or "authorization" or "session_id" or null,
  "tokenEmbedLocation": "header" | "cookie" | "query",
  "headerName": "Authorization" or "X-API-Key" or null,
  "headerPrefix": "Bearer " or "" or null,
  "cookieName": "session" or null,
  "queryParamName": "token" or null,
  "reauthIndicator": "status" | "redirect" | "body",
  "reauthBodyPattern": "regex pattern" or null,
  "protectedEndpointPath": "/api/some/protected/path" or null,
  "notes": "brief description"
}

CRITICAL RULES:
- "loginBody" values MUST come from actual files you read (seed data, env vars, docker-compose, README)
- Do NOT invent credentials like "admin@example.com" or "correctpassword"
- "loginContentType": "json" for JSON APIs, "form" for HTML form login, "xml" for SOAP
- "tokenLocation": "body" if token is in JSON response body, "header" if in response header, "cookie" if set via Set-Cookie
- "tokenEmbedLocation": "header" for Authorization, "cookie" if app reads auth from cookies, "query" if token goes in URL
- "reauthIndicator": "status" for 401/403 responses, "redirect" for 301/302 to login page, "body" for 200 OK with error message in body
- "reauthBodyPattern": Only when reauthIndicator is "body" — regex matching the auth failure message. null otherwise.
- "protectedEndpointPath" MUST be an endpoint that RETURNS 401 or 403 when accessed WITHOUT auth. Read the route handler code to confirm it has an auth guard/middleware. Do NOT pick endpoints that return 200 without auth.`,
    },
  ];

  const response = await chatWithTools(llm, messages, codebaseTools, handler, undefined, 30);

  try {
    const parsed = JSON.parse(extractJson(response));
    return {
      requiresAuth: parsed.requiresAuth ?? previousDetection.requiresAuth,
      authType: parsed.authType ?? previousDetection.authType,
      loginEndpoint: parsed.loginEndpoint ?? previousDetection.loginEndpoint,
      loginMethod: parsed.loginMethod ?? previousDetection.loginMethod,
      loginBody: parsed.loginBody ?? previousDetection.loginBody,
      loginContentType: parsed.loginContentType ?? previousDetection.loginContentType,
      tokenLocation: parsed.tokenLocation ?? previousDetection.tokenLocation,
      tokenFieldPath: parsed.tokenFieldPath ?? previousDetection.tokenFieldPath,
      tokenEmbedLocation: parsed.tokenEmbedLocation ?? previousDetection.tokenEmbedLocation,
      headerName: parsed.headerName ?? previousDetection.headerName,
      headerPrefix: parsed.headerPrefix ?? previousDetection.headerPrefix,
      cookieName: parsed.cookieName ?? previousDetection.cookieName,
      queryParamName: parsed.queryParamName ?? previousDetection.queryParamName,
      reauthIndicator: parsed.reauthIndicator ?? previousDetection.reauthIndicator,
      reauthBodyPattern: parsed.reauthBodyPattern ?? previousDetection.reauthBodyPattern,
      protectedEndpointPath: parsed.protectedEndpointPath ?? previousDetection.protectedEndpointPath,
      notes: parsed.notes ?? previousDetection.notes,
    };
  } catch {
    console.warn("[Auth] Could not parse retry detection response — using previous detection");
    return previousDetection;
  }
}

// ---------------------------------------------------------------------------
// Delete a broken auth object before retrying
// ---------------------------------------------------------------------------

async function deleteAuthObject(
  brightToken: string,
  brightHostname: string,
  authObjectId: string,
): Promise<void> {
  try {
    const res = await fetch(
      `https://${brightHostname}/api/v3/auth-objects/${encodeURIComponent(authObjectId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Api-Key ${brightToken}` },
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
