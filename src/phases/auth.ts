import type OpenAI from "openai";
import type { TechStack, DiscoveredEndpoint } from "../types.js";
import type { BrightMcpClient } from "../mcp-client.js";
import { chatWithTools } from "../inference.js";
import { codebaseTools, createToolHandler } from "../tools.js";
import { formatTechStack, extractJson } from "../utils.js";

export interface AuthResult {
  /** Single auth object ID for the whole app, or undefined if no auth. */
  authObjectId: string | undefined;
  /** True if auth was configured. */
  hasAuth: boolean;
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
  // Step 1: Detect auth from source code using the LLM
  const detection = await detectAuthFromCode(llm, repoPath, techStack, endpoints, baseUrl);

  if (!detection.requiresAuth) {
    console.log("[Auth] No auth required");
    return { authObjectId: undefined, hasAuth: false };
  }

  console.log(`[Auth] Detected auth: ${detection.authType} — ${detection.notes}`);

  // Step 2: Check for existing auth objects we can reuse
  const existingAuth = await findExistingAuth(bright, projectId, detection);
  if (existingAuth) {
    console.log(`[Auth] Reusing existing auth object: ${existingAuth}`);
    return { authObjectId: existingAuth, hasAuth: true };
  }

  // Step 3: Create a new auth object programmatically
  const authObjectId = await createAuthObject(
    bright, projectId, baseUrl, repeaterId, detection,
  );

  if (!authObjectId) {
    console.warn("[Auth] Failed to create auth object — proceeding without auth");
    return { authObjectId: undefined, hasAuth: false };
  }

  console.log(`[Auth] Created auth object: ${authObjectId}`);

  // Step 4: Test the auth object to verify it works
  const testOk = await testAuthObject(brightToken, brightHostname, authObjectId);
  if (!testOk) {
    console.warn("[Auth] Auth object test failed — it may not work during scans");
  }

  return { authObjectId, hasAuth: true };
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

Look for:
- Auth middleware (passport, jwt, express-jwt, @nestjs/passport, Spring Security, auth guards, etc.)
- Login/signup endpoints and their request/response shapes
- How tokens are extracted from responses (JSON field names)
- How tokens are injected into requests (header name, prefix like "Bearer ")
- Default/seed credentials (test users, admin accounts)
- Session/cookie-based auth patterns

Base URL: ${baseUrl}`,
    },
    {
      role: "user",
      content: `Analyze the authentication for this app.

Known endpoints:
${endpointSummary}

Search the codebase thoroughly. Read auth middleware, login handlers, and seed data files.

Return ONLY a JSON object with these exact fields:
{
  "requiresAuth": true/false,
  "authType": "jwt" | "session" | "api_key" | "basic" | "oauth" | "none",
  "loginEndpoint": "/api/auth/login" or null,
  "loginMethod": "POST" or null,
  "loginBody": "{\\"email\\":\\"admin@example.com\\",\\"password\\":\\"admin123\\"}" or null,
  "tokenFieldPath": "token" or "data.accessToken" or null,
  "headerName": "Authorization" or "X-API-Key" or null,
  "headerPrefix": "Bearer " or "" or null,
  "protectedEndpointPath": "/api/users" or null,
  "notes": "brief description of the auth mechanism"
}

IMPORTANT:
- "tokenFieldPath" is the dot-path to the token in the JSON login response (e.g. "token", "data.accessToken", "access_token")
- "headerPrefix" is what comes before the token value (e.g. "Bearer " with trailing space, or "" for none)
- "protectedEndpointPath" is a known protected endpoint for testing auth validity
- "loginBody" must be a valid JSON string with real credentials found in seed data, env vars, or code`,
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
  bright: BrightMcpClient,
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
    // Static header auth — extract credentials from the login body or notes
    return createHeaderAuth(bright, projectId, repeaterId, testUrl, detection);
  }

  // For jwt/session/oauth — use multistep with login flow
  if (!loginEndpoint || !loginBody) {
    console.warn("[Auth] Login endpoint or credentials not found — cannot create auth");
    return undefined;
  }

  const loginUrl = `${baseUrl}${loginEndpoint}`;

  // Build the NexTemplate regex for token extraction
  const tokenRegex = buildTokenRegex(tokenFieldPath ?? "token");
  const template = `${headerPrefix ?? "Bearer "}{{ auth_object.stages.login.response.body | match: /${tokenRegex}/ }}`;

  const authArgs: Record<string, unknown> = {
    name: `Engine Auth — ${authType}`,
    projectId,
    type: "multistep",
    test: {
      request: {
        method: "GET",
        url: testUrl,
      },
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
              headers: [{ name: "Content-Type", value: "application/json" }],
              body: loginBody,
            },
            successResponseDetection: [{ type: "status", statuses: [200, 201] }],
          },
        ],
        embedders: [
          {
            type: "header",
            name: headerName ?? "Authorization",
            template,
          },
        ],
      },
    },
  };

  try {
    const result = await bright.callMcpToolRaw("addAuth", authArgs);

    if (result.startsWith("Error")) {
      console.error(`[Auth] addAuth failed: ${result.slice(0, 300)}`);
      return undefined;
    }

    const parsed = JSON.parse(result);
    return (parsed.authObjectId ?? parsed.id) as string | undefined;
  } catch (err) {
    console.error(`[Auth] Failed to create auth object: ${err}`);
    return undefined;
  }
}

async function createHeaderAuth(
  bright: BrightMcpClient,
  projectId: string,
  repeaterId: string,
  testUrl: string,
  detection: AuthDetection,
): Promise<string | undefined> {
  // For static header / basic auth, create a "header" type auth object
  const headerValue = detection.loginBody ?? "";
  const authArgs: Record<string, unknown> = {
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
      header: {
        headers: [
          {
            name: detection.headerName ?? "Authorization",
            value: headerValue,
          },
        ],
      },
    },
  };

  try {
    const result = await bright.callMcpToolRaw("addAuth", authArgs);
    if (result.startsWith("Error")) {
      console.error(`[Auth] addAuth (header) failed: ${result.slice(0, 300)}`);
      return undefined;
    }
    const parsed = JSON.parse(result);
    return (parsed.authObjectId ?? parsed.id) as string | undefined;
  } catch (err) {
    console.error(`[Auth] Failed to create header auth: ${err}`);
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

async function testAuthObject(
  brightToken: string,
  brightHostname: string,
  authObjectId: string,
): Promise<boolean> {
  const url = `https://${brightHostname}/api/v3/auth-objects/${encodeURIComponent(authObjectId)}/test`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Api-Key ${brightToken}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      console.warn(`[Auth] Test auth failed: HTTP ${res.status} ${res.statusText}`);
      return false;
    }

    const results = (await res.json()) as Array<{ stage: string; status: string; message?: string }>;
    const allPassed = results.every((r) => r.status === "success");

    for (const r of results) {
      console.log(`[Auth] Test stage=${r.stage} status=${r.status}${r.message ? ` — ${r.message}` : ""}`);
    }

    if (!allPassed) {
      console.warn("[Auth] One or more auth test stages failed");
    }

    return allPassed;
  } catch (err) {
    console.log(`[Auth] Auth test request failed: ${err}`);
    return true; // Optimistically proceed
  }
}
