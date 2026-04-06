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
  const MAX_AUTH_ATTEMPTS = 3;

  // Step 1: Detect auth from source code using the LLM
  let detection = await detectAuthFromCode(llm, repoPath, techStack, endpoints, baseUrl);

  if (!detection.requiresAuth) {
    console.log("[Auth] No auth required");
    return { authObjectId: undefined, hasAuth: false, authFailed: false };
  }

  console.log(`[Auth] Detected auth: ${detection.authType} — ${detection.notes}`);

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

    const testResult = await testAuthObject(brightToken, brightHostname, authObjectId);
    if (testResult.passed) {
      return { authObjectId, hasAuth: true, authFailed: false };
    }

    console.warn(`[Auth] Attempt ${attempt}: Auth test failed — ${testResult.summary}`);

    if (attempt < MAX_AUTH_ATTEMPTS) {
      // Delete the broken auth object before retrying
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
- Read the login handler to find the exact response body field names (e.g. "token", "accessToken", "data.token")

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

Known endpoints:
${endpointSummary}

You MUST search the codebase and READ files before answering. Do NOT guess — actually look at the code.

Return ONLY a JSON object with these exact fields:
{
  "requiresAuth": true/false,
  "authType": "jwt" | "session" | "api_key" | "basic" | "oauth" | "none",
  "loginEndpoint": "/api/auth/login" or null,
  "loginMethod": "POST" or null,
  "loginBody": "{\\"user\\":\\"actual-user-from-code\\",\\"password\\":\\"actual-pass-from-code\\"}" or null,
  "tokenFieldPath": "token" or "data.accessToken" or null,
  "headerName": "Authorization" or "X-API-Key" or null,
  "headerPrefix": "Bearer " or "" or null,
  "protectedEndpointPath": "/api/users" or null,
  "notes": "brief description including where you found the credentials"
}

CRITICAL RULES:
- "loginBody" field names MUST match what the login endpoint handler expects (read the code!)
- "loginBody" credential values MUST come from seed data, env vars, docker-compose, or code you actually read
- If you cannot find real credentials, set "loginBody" to null — do NOT invent values
- "tokenFieldPath" is the dot-path to the token in the JSON login response
- "protectedEndpointPath" should be a known endpoint that requires authentication`,
    },
  ];

  const response = await chatWithTools(llm, messages, codebaseTools, handler, "gpt-4o", 20);

  try {
    const parsed = JSON.parse(extractJson(response));
    return {
      requiresAuth: parsed.requiresAuth ?? false,
      authType: parsed.authType ?? "none",
      loginEndpoint: parsed.loginEndpoint ?? null,
      loginMethod: parsed.loginMethod ?? "POST",
      loginBody: parsed.loginBody ?? null,
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
    tokenFieldPath, headerName, headerPrefix, protectedEndpointPath,
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

  // Build the NexTemplate regex for token extraction
  const tokenRegex = buildTokenRegex(tokenFieldPath ?? "token");
  const template = `${headerPrefix ?? "Bearer "}{{ stages.login.response.body | match: /${tokenRegex}/ }}`;

  const body = {
    name: `Engine Auth — ${authType}`,
    projectId,
    type: "multistep",
    test: {
      request: { method: "GET", url: testUrl },
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
// Step 4: Test the auth object
// ---------------------------------------------------------------------------

interface AuthTestResult {
  passed: boolean;
  summary: string;
}

async function testAuthObject(
  brightToken: string,
  brightHostname: string,
  authObjectId: string,
): Promise<AuthTestResult> {
  const base = `https://${brightHostname}`;
  const headers = {
    Authorization: `Api-Key ${brightToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  try {
    // Start an async auth object test
    const createRes = await fetch(`${base}/api/v3/auth-objects/tests`, {
      method: "POST",
      headers,
      body: JSON.stringify({ authObjectId }),
    });

    if (!createRes.ok) {
      const body = await createRes.text().catch(() => "");
      return { passed: false, summary: `Failed to start auth test: HTTP ${createRes.status} — ${body.slice(0, 300)}` };
    }

    const testView = (await createRes.json()) as {
      id: string;
      results: Array<{ stage: string; status: string; message?: string }>;
      finishedAt: string | null;
    };

    console.log(`[Auth] Auth test started: ${testView.id}`);

    // Poll for results until finishedAt is set
    const maxWaitMs = 90_000;
    const pollIntervalMs = 3_000;
    const start = Date.now();

    let latest = testView;

    while (!latest.finishedAt && Date.now() - start < maxWaitMs) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));

      const pollRes = await fetch(
        `${base}/api/v3/auth-objects/tests/${encodeURIComponent(latest.id)}`,
        { method: "GET", headers },
      );

      if (!pollRes.ok) {
        return { passed: false, summary: `Poll auth test failed: HTTP ${pollRes.status}` };
      }

      latest = (await pollRes.json()) as typeof testView;
    }

    if (!latest.finishedAt) {
      return { passed: false, summary: "Auth test timed out after 90s" };
    }

    const lines: string[] = [];
    for (const r of latest.results) {
      const line = `stage=${r.stage} status=${r.status}${r.message ? ` — ${r.message}` : ""}`;
      console.log(`[Auth] Test ${line}`);
      lines.push(line);
    }

    const allPassed = latest.results.every((r) => r.status === "success");
    return { passed: allPassed, summary: lines.join("\n") };
  } catch (err) {
    return { passed: false, summary: `Auth test request failed: ${err}` };
  }
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

Known endpoints:
${endpointSummary}

Return ONLY a JSON object with these exact fields:
{
  "requiresAuth": true/false,
  "authType": "jwt" | "session" | "api_key" | "basic" | "oauth" | "none",
  "loginEndpoint": "/api/auth/login" or null,
  "loginMethod": "POST" or null,
  "loginBody": "{\\"email\\":\\"admin@example.com\\",\\"password\\":\\"correctpassword\\"}" or null,
  "tokenFieldPath": "token" or "data.accessToken" or null,
  "headerName": "Authorization" or "X-API-Key" or null,
  "headerPrefix": "Bearer " or "" or null,
  "protectedEndpointPath": "/api/users" or null,
  "notes": "brief description"
}`,
    },
  ];

  const response = await chatWithTools(llm, messages, codebaseTools, handler, "gpt-4o", 20);

  try {
    const parsed = JSON.parse(extractJson(response));
    return {
      requiresAuth: parsed.requiresAuth ?? previousDetection.requiresAuth,
      authType: parsed.authType ?? previousDetection.authType,
      loginEndpoint: parsed.loginEndpoint ?? previousDetection.loginEndpoint,
      loginMethod: parsed.loginMethod ?? previousDetection.loginMethod,
      loginBody: parsed.loginBody ?? previousDetection.loginBody,
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
