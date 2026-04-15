import type OpenAI from "openai";
import type { TechStack, DiscoveredEndpoint } from "../types.js";
import type { BrightMcpClient } from "../mcp-client.js";
import type { ChatCompletionTool } from "openai/resources/chat/completions.mjs";
import { chatWithTools, type ToolHandler } from "../inference.js";
import {
  codebaseTools,
  createToolHandler,
  convertMcpToolsToOpenAI,
  createMcpToolHandler,
} from "../tools.js";
import { formatTechStack, extractJson } from "../utils.js";

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
  endpoints: DiscoveredEndpoint[],
  projectId: string,
  baseUrl: string,
  repeaterId: string,
  brightToken: string,
  brightHostname: string,
  model?: string,
): Promise<AuthResult> {
  // Phase 1: Detect auth from source code
  const detection = await detectAuthFromCode(
    llm,
    repoPath,
    techStack,
    endpoints,
    baseUrl,
    model,
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

  // Phase 2: Register a test user locally if the app has no seeded users
  await registerUser(baseUrl, detection);

  // Phase 3: Let the LLM create + test + fix the auth object via MCP tools
  const authObjectId = await createAuthViaMcp(
    llm,
    bright,
    repoPath,
    detection,
    projectId,
    baseUrl,
    repeaterId,
    brightToken,
    brightHostname,
    model,
  );

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
  endpoints: DiscoveredEndpoint[],
  baseUrl: string,
  model?: string,
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

STEP 4 — Find the user registration/signup endpoint (if applicable):
- Many apps (especially demo/test apps) have NO seeded users — you MUST register one before logging in
- Search for registration/signup routes (e.g. POST /register, POST /signup, POST /api/auth/register)
- Read the registration handler to find the EXACT field names (email, username, password, cpassword, name, etc.)
- Build a registerBody using the SAME credentials from loginBody, plus any extra required fields
- For extra fields like "name", use a reasonable value like "Test User"
- For "cpassword" or "confirmPassword" fields, use the same password value
- If the app seeds users in DB migrations/fixtures and registration is NOT needed, set registerEndpoint to null

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
  "registerEndpoint": "/register" or "/signup" or null,
  "registerMethod": "POST" or null,
  "registerBody": "email=test@test.com&password=pass&username=user&name=Test+User&cpassword=pass" or null,
  "notes": "brief description including where you found the credentials"
}

CRITICAL RULES:
- "loginBody" field names MUST match what the login endpoint handler expects (read the code!)
- "loginBody" credential values MUST come from seed data, env vars, docker-compose, or code you actually read
- If you cannot find real credentials BUT a registration endpoint exists, invent a consistent set of test credentials used in BOTH registerBody and loginBody (e.g. username=testuser, password=TestPass123, email=test@test.com)
- If you cannot find credentials AND there is no registration endpoint, set "loginBody" to null
- "loginBody" FORMAT: when "loginContentType" is "form", use URL-encoded format like "username=value&password=value" — NOT JSON. When "json", use JSON like '{"username":"value","password":"value"}'
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
- "reauthBodyPattern": Only set when reauthIndicator is "body". A regex pattern that matches the body content indicating auth failure (e.g. "session.expired|login.required|unauthorized"). Set to null for "status" or "redirect" (redirects have no body, only a Location header).
- "protectedEndpointPath" MUST be an endpoint that requires authentication. When accessed WITHOUT the auth token it should:
  - Return 401/403 (for API-style apps with reauthIndicator "status")
  - OR redirect to the login page (for server-rendered apps with reauthIndicator "redirect")
  To verify:
  1. Pick a candidate from the Known endpoints list above
  2. STRONGLY PREFER endpoints with NO path parameters (no :id, :email, etc.) — e.g. /learn is better than /learn/vulnerability/:vuln
  3. Read its route definition and handler code
  4. Confirm it has auth middleware/guard applied (e.g. isAuthenticated, @UseGuards, passport.authenticate, jwt required, AuthGuard, etc.)
  5. If the route has NO auth guard or the guard is optional, pick a DIFFERENT endpoint
  6. Do NOT pick endpoints that return 200 for unauthenticated requests (e.g. public pages, public APIs)
  7. Do NOT invent endpoints — pick from the list above
- "registerEndpoint": set if the app has a registration/signup endpoint and NO seeded users. null if users are pre-seeded.
- "registerBody": form-encoded or JSON body for registration, using the SAME credentials as loginBody plus any extra required fields (name, email, cpassword, etc.)
- "registerMethod": usually "POST"`,
    },
  ];

  const response = await chatWithTools(
    llm,
    messages,
    codebaseTools,
    handler,
    model,
    40,
  );

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
  brightToken: string,
  brightHostname: string,
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
    return postAuthObject(brightToken, brightHostname, body);
  }

  // --- Session or JWT: multistep auth ---
  const isSession = authStyle === "session";

  // reauthTriggers: header Location for session, status 401/403 for JWT
  const reauthTriggers = isSession
    ? [
        {
          type: "TRIGGER",
          location: "header",
          name: "Location",
          patterns: ["login"],
        },
      ]
    : [{ type: "TRIGGER", location: "status", statuses: [401, 403] }];

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
        ...redirectOpts,
      },
    },
    successResponseDetection: [{ type: "status", statuses: [200] }],
    reauthTriggers,
    config: {
      multistep: {
        steps: [
          {
            name: "login",
            request: {
              method: "POST",
              url: loginUrl,
              protocol: "http",
              headers: [
                {
                  name: "Content-Type",
                  value: contentType,
                  type: "clear_text",
                  mergeStrategy: "replace",
                },
              ],
              bodyType: "clear_text",
              body: normalizedBody,
              ...redirectOpts,
            },
            successResponseDetection: [
              {
                type: "status",
                statuses: isSession ? [200, 201, 302] : [200, 201],
              },
            ],
          },
        ],
        ...(embedders.length > 0 ? { embedders } : {}),
      },
    },
  };

  console.log(
    `[Auth] Creating ${authStyle} auth via REST API — login: ${loginUrl}, test: ${testUrl}`,
  );
  return postAuthObject(brightToken, brightHostname, body);
}

async function postAuthObject(
  brightToken: string,
  brightHostname: string,
  body: Record<string, unknown>,
): Promise<{ id?: string; error?: string }> {
  try {
    const res = await fetch(`https://${brightHostname}/api/v3/auth-objects`, {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${brightToken}`,
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
  _repoPath: string,
  detection: AuthDetection,
  projectId: string,
  baseUrl: string,
  repeaterId: string,
  brightToken: string,
  brightHostname: string,
  model?: string,
): Promise<string | undefined> {
  // MCP tools for inspection only (listAuths, getAuth)
  const mcpSchemas = await bright.getMcpToolSchemas(["getAuth", "listAuths"]);
  const mcpToolsDefs = convertMcpToolsToOpenAI(mcpSchemas);
  const mcpHandler = createMcpToolHandler(bright);

  // Custom tools that wrap our programmatic REST API calls
  const customTools: ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "create_auth",
        description: `Create a Bright auth object with all the correct settings pre-configured.
For session/cookie auth: automatically disables redirect following, uses header Location reauthTrigger, no embedder needed.
For JWT auth: automatically uses status 401/403 reauthTrigger, adds Bearer header embedder.
For API key: creates a static header auth object.`,
        parameters: {
          type: "object",
          properties: {
            authStyle: {
              type: "string",
              enum: ["session", "jwt", "api_key"],
              description:
                "The authentication style: 'session' for cookie/session-based (Express+Passport, form login with 302 redirects), 'jwt' for JSON Web Token, 'api_key' for static API key header",
            },
            loginUrl: {
              type: "string",
              description:
                "Full URL for the login endpoint (e.g. http://localhost:9090/login)",
            },
            loginBody: {
              type: "string",
              description:
                'Login request body. For form: \'username=user&password=pass\'. For JSON: \'{"email":"user","password":"pass"}\'',
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
                "Full URL to a protected endpoint used to verify auth works (e.g. http://localhost:9090/learn)",
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
  ];

  const customHandler: ToolHandler = async (name, args) => {
    if (name === "create_auth") {
      const result = await createAuthViaRestApi(
        brightToken,
        brightHostname,
        projectId,
        repeaterId,
        {
          authStyle: String(args.authStyle),
          loginUrl: String(args.loginUrl),
          loginBody: String(args.loginBody),
          loginContentType: String(args.loginContentType),
          testUrl: String(args.testUrl),
          tokenFieldPath: args.tokenFieldPath
            ? String(args.tokenFieldPath)
            : undefined,
          headerName: args.headerName ? String(args.headerName) : undefined,
          headerValue: args.headerValue ? String(args.headerValue) : undefined,
        },
      );
      if (result.error) return JSON.stringify({ error: result.error });
      return JSON.stringify({ authObjectId: result.id });
    }
    if (name === "test_auth_object") {
      const result = await testAuthObject(
        brightToken,
        brightHostname,
        String(args.authObjectId),
      );
      return JSON.stringify(result);
    }
    if (name === "delete_auth_object") {
      await deleteAuthObject(
        brightToken,
        brightHostname,
        String(args.authObjectId),
      );
      return "Deleted successfully";
    }
    return `Unknown tool: ${name}`;
  };

  const combinedHandler: ToolHandler = async (name, args) => {
    if (
      name === "create_auth" ||
      name === "test_auth_object" ||
      name === "delete_auth_object"
    ) {
      return customHandler(name, args);
    }
    return mcpHandler(name, args);
  };

  const allTools = [...mcpToolsDefs, ...customTools];

  // Resolve protected endpoint path for test URL
  const resolvedPath = detection.protectedEndpointPath
    ? detection.protectedEndpointPath
        .replace(/:(\w+)/g, "1")
        .replace(/\{(\w+)\}/g, "1")
    : "/";
  const testUrl = `${baseUrl}${resolvedPath}`;

  const systemPrompt = `You are an expert at configuring Bright DAST authentication objects.

## Context
- Base URL: ${baseUrl}
- App auth type: ${detection.authType}
- Login endpoint: ${detection.loginEndpoint ?? "unknown"}
- Login method: ${detection.loginMethod ?? "POST"}
- Login body: ${detection.loginBody ?? "unknown"}
- Login content type: ${detection.loginContentType}
- Token location: ${detection.tokenLocation}
- Token field path: ${detection.tokenFieldPath ?? "unknown"}
- Token embed location: ${detection.tokenEmbedLocation}
- Cookie name: ${detection.cookieName ?? "none"}
- Reauth indicator: ${detection.reauthIndicator}
- Protected endpoint (test URL): ${testUrl}

## Your task
Create a working auth object and test it. Follow these steps:

1. **Optionally inspect existing auth objects** using listAuths/getAuth to learn from previous configurations.
   - Clean up any broken ones with delete_auth_object.

2. **Create the auth object** using create_auth. This tool handles redirect settings, reauthTriggers, and embedders automatically based on authStyle:
   - \`session\` — for cookie/session auth (Express+Passport, form login, 302 redirects). Disables redirect following, uses header Location reauthTrigger.
   - \`jwt\` — for JWT token auth. Uses status 401/403 reauthTrigger, adds Bearer header embedder.
   - \`api_key\` — for static API key header auth.

3. **Test it** using test_auth_object.

4. **If the test fails**, analyze the error:
   - "authentication" failure → wrong credentials in loginBody. Delete and recreate with corrected credentials.
   - "authorization" failure → the test URL or auth configuration is wrong. Try a different testUrl or check credentials.
   - "validation" failure → reauthTriggers didn't match. This is handled automatically by the tool, so the issue is likely credentials or testUrl.
   Repeat up to 10 times.

5. **When all stages pass**, respond with ONLY the auth object ID (nothing else).

## Key rules
- authStyle "${detection.authType === "session" ? "session" : detection.authType === "jwt" ? "jwt" : detection.authType === "api_key" ? "api_key" : "session"}" based on detected auth type
- loginContentType: "${detection.loginContentType}" — for "form" use URL-encoded body like "username=user&password=pass", for "json" use JSON
- loginBody values MUST use the exact credentials from the detection context above
- testUrl should be a protected endpoint that requires auth
- If you cannot make it work after 10 attempts, return "FAILED"`;

  const messages: Parameters<typeof chatWithTools>[1] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content:
        "Create and test a working auth object for this application. Return only the auth object ID when it passes.",
    },
  ];

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
  if (trimmed === "FAILED" || trimmed.length === 0) {
    console.error("[Auth] LLM could not configure auth");
    return undefined;
  }

  // Extract auth object ID from response (may be a UUID or hex string)
  const idMatch = trimmed.match(/[0-9a-f]{24}|[0-9a-f-]{36}/i);
  return idMatch ? idMatch[0] : trimmed;
}

// ---------------------------------------------------------------------------
// Register a test user locally before login (for apps with no seeded users)
// ---------------------------------------------------------------------------

export async function registerUser(
  baseUrl: string,
  detection: AuthDetection,
): Promise<void> {
  if (!detection.registerEndpoint || !detection.registerBody) return;

  const url = `${baseUrl}${detection.registerEndpoint}`;
  const contentTypeMap: Record<string, string> = {
    json: "application/json",
    form: "application/x-www-form-urlencoded",
    xml: "application/xml",
  };
  const ct = contentTypeMap[detection.loginContentType] ?? "application/json";
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
  } catch (err) {
    console.warn(
      `[Auth] Registration call failed (user may already exist): ${err}`,
    );
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
  const contentTypeMap: Record<string, string> = {
    json: "application/json",
    form: "application/x-www-form-urlencoded",
    xml: "application/xml",
  };
  const url = `${registration.baseUrl}${registration.endpoint}`;
  const ct = contentTypeMap[registration.contentType] ?? "application/json";
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
// Test the auth object (sync GET with retry)
// ---------------------------------------------------------------------------

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
