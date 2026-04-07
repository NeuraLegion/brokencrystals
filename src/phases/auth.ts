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
    return { authObjectId, hasAuth: true, authFailed: false };
  }

  console.error("[Auth] All auth creation attempts failed — cannot proceed");
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
  tokenLocation: "body" | "header";
  tokenFieldPath: string | null;
  headerName: string | null;
  headerPrefix: string | null;
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
  "tokenLocation": "body" or "header",
  "tokenFieldPath": "token" or "authorization" or null,
  "headerName": "Authorization" or "X-API-Key" or null,
  "headerPrefix": "Bearer " or "" or null,
  "protectedEndpointPath": "/api/some/protected/path" or null,
  "notes": "brief description including where you found the credentials"
}

CRITICAL RULES:
- "loginBody" field names MUST match what the login endpoint handler expects (read the code!)
- "loginBody" credential values MUST come from seed data, env vars, docker-compose, or code you actually read
- If you cannot find real credentials, set "loginBody" to null — do NOT invent values
- "tokenLocation": set to "body" if the token is in the JSON response body, or "header" if the token is returned as a response header (e.g. authorization header). READ THE LOGIN HANDLER CODE to determine this!
- "tokenFieldPath": if tokenLocation is "body", this is the dot-path to the token field (e.g. "token", "data.accessToken"). If tokenLocation is "header", this is the header name in lowercase (e.g. "authorization")
- "protectedEndpointPath" MUST be an endpoint that RETURNS 401 or 403 when accessed WITHOUT the auth token. To verify this:
  1. Pick a candidate from the Known endpoints list above
  2. Read its route definition and handler code
  3. Confirm it has auth middleware/guard applied (e.g. @UseGuards, passport.authenticate, jwt required, AuthGuard, etc.)
  4. If the route has NO auth guard or the guard is optional, pick a DIFFERENT endpoint
  5. Do NOT pick endpoints that return 200 for unauthenticated requests (e.g. public pages, public APIs)
  6. Do NOT invent endpoints — pick from the list above`,
    },
  ];

  const response = await chatWithTools(llm, messages, codebaseTools, handler, "gpt-4o", 40);

  try {
    const parsed = JSON.parse(extractJson(response));
    return {
      requiresAuth: parsed.requiresAuth ?? false,
      authType: parsed.authType ?? "none",
      loginEndpoint: parsed.loginEndpoint ?? null,
      loginMethod: parsed.loginMethod ?? "POST",
      loginBody: parsed.loginBody ?? null,
      tokenLocation: parsed.tokenLocation ?? "body",
      tokenFieldPath: parsed.tokenFieldPath ?? null,
      headerName: parsed.headerName ?? "Authorization",
      headerPrefix: parsed.headerPrefix ?? "Bearer ",
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
      tokenLocation: "body",
      tokenFieldPath: null,
      headerName: null,
      headerPrefix: null,
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
    authType, loginEndpoint, loginMethod, loginBody,
    tokenLocation, tokenFieldPath, headerName, headerPrefix, protectedEndpointPath,
  } = detection;

  // Build the test request for a known protected endpoint
  const testUrl = protectedEndpointPath
    ? `${baseUrl}${protectedEndpointPath}`
    : `${baseUrl}/`;

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

  // Build the NexTemplate for token extraction
  let template: string;
  if (tokenLocation === "header") {
    // Token is in a response header (e.g. authorization)
    const headerKey = (tokenFieldPath ?? "authorization").toLowerCase();
    template = `{{ auth_object.stages.login.response.headers | get: '/${headerKey}' }}`;
  } else {
    // Token is in the JSON response body
    const tokenRegex = buildTokenRegex(tokenFieldPath ?? "token");
    template = `${headerPrefix ?? "Bearer "}{{ auth_object.stages.login.response.body | match: /${tokenRegex}/ }}`;
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
    reauthTriggers: [{ type: "TRIGGER", location: "status", statuses: [401, 403] }],
    config: {
      multistep: {
        steps: [
          {
            name: "login",
            request: {
              url: loginUrl,
              method: loginMethod ?? "POST",
              protocol: "http",
              headers: [{ name: "Content-Type", value: "application/json", type: "clear_text" }],
              body: loginBody,
              bodyType: "clear_text",
            },
            successResponseDetection: [{ type: "status", statuses: [200, 201] }],
          },
        ],
        embedders: [
          {
            type: "header" as const,
            name: headerName ?? "Authorization",
            template,
            templateType: "clear_text",
            mergeStrategy: "replace",
          },
        ],
      },
    },
  };

  console.log(`[Auth] Creating multistep auth object via REST API`);
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
    reauthTriggers: [{ type: "TRIGGER", location: "status", statuses: [401, 403] }],
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
  "tokenLocation": "body" or "header",
  "tokenFieldPath": "token" or "authorization" or null,
  "headerName": "Authorization" or "X-API-Key" or null,
  "headerPrefix": "Bearer " or "" or null,
  "protectedEndpointPath": "/api/some/protected/path" or null,
  "notes": "brief description"
}

CRITICAL RULES:
- "loginBody" values MUST come from actual files you read (seed data, env vars, docker-compose, README)
- Do NOT invent credentials like "admin@example.com" or "correctpassword"
- "tokenLocation": "body" if token is in JSON response body, "header" if token is in a response header. Read the login handler code!
- "protectedEndpointPath" MUST be an endpoint that RETURNS 401 or 403 when accessed WITHOUT auth. Read the route handler code to confirm it has an auth guard/middleware. Do NOT pick endpoints that return 200 without auth.`,
    },
  ];

  const response = await chatWithTools(llm, messages, codebaseTools, handler, "gpt-4o", 30);

  try {
    const parsed = JSON.parse(extractJson(response));
    return {
      requiresAuth: parsed.requiresAuth ?? previousDetection.requiresAuth,
      authType: parsed.authType ?? previousDetection.authType,
      loginEndpoint: parsed.loginEndpoint ?? previousDetection.loginEndpoint,
      loginMethod: parsed.loginMethod ?? previousDetection.loginMethod,
      loginBody: parsed.loginBody ?? previousDetection.loginBody,
      tokenLocation: parsed.tokenLocation ?? previousDetection.tokenLocation,
      tokenFieldPath: parsed.tokenFieldPath ?? previousDetection.tokenFieldPath,
      headerName: parsed.headerName ?? previousDetection.headerName,
      headerPrefix: parsed.headerPrefix ?? previousDetection.headerPrefix,
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
