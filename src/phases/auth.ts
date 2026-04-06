import type OpenAI from "openai";
import type { TechStack, DiscoveredEndpoint } from "../types.js";
import type { BrightMcpClient } from "../mcp-client.js";
import { chatWithTools } from "../inference.js";
import {
  codebaseTools,
  createToolHandler,
  convertMcpToolsToOpenAI,
  createMcpToolHandler,
  combineToolHandlers,
} from "../tools.js";
import { formatTechStack, extractJson } from "../utils.js";

export interface AuthResult {
  /** Map from "METHOD /path" → authObjectId. Missing key = no auth. */
  endpointAuthMap: Record<string, string>;
  /** True if at least one endpoint has auth configured. */
  hasAuth: boolean;
}

export async function detectAndConfigureAuth(
  llm: OpenAI,
  bright: BrightMcpClient,
  repoPath: string,
  techStack: TechStack,
  endpoints: DiscoveredEndpoint[],
  projectId: string,
  baseUrl: string,
  repeaterId: string,
): Promise<AuthResult> {
  const mcpSchemas = await bright.getMcpToolSchemas(["addAuth", "listAuths"]);
  const mcpTools = convertMcpToolsToOpenAI(mcpSchemas);
  const mcpHandler = createMcpToolHandler(bright);
  const codeHandler = createToolHandler(repoPath);
  const handler = combineToolHandlers(codeHandler, mcpHandler);
  const tools = [...codebaseTools, ...mcpTools];

  const stackStr = formatTechStack(techStack);
  const endpointSummary = endpoints
    .map((ep) => `${ep.method} ${ep.path} (${ep.filePath})`)
    .join("\n");

  const messages: Parameters<typeof chatWithTools>[1] = [
    {
      role: "system",
      content: `You are a security analyst configuring authentication for a Bright DAST security scan.

You have two types of tools:
1. Codebase tools (read_file, list_files, search_files) — to analyze source code for auth patterns
2. Bright tools (addAuth, listAuths) — to create auth objects in the scanner

Tech stack: ${stackStr}
Base URL: ${baseUrl}
Project ID: ${projectId}
Repeater ID: ${repeaterId}

## CRITICAL: Choosing the right auth type

- **"header"** — ONLY for truly static tokens (API keys, fixed secrets that NEVER expire). These are hardcoded values.
- **"multistep"** — For ANY login-based auth (JWT, session cookies, tokens from a login endpoint). This performs a login request, extracts the token from the response, and injects it into scan requests. USE THIS for most applications.
- **"oidc"** — For OAuth2/OpenID Connect flows with client credentials or password grants.

⚠️ If the app has a login endpoint that returns a token/session — you MUST use "multistep", NOT "header".

## How to configure "multistep" auth

The "multistep" type defines steps (HTTP requests) and embedders (how to inject the token into scan requests).

### Steps
Each step has a \`name\` (alphanumeric, starts with letter) and a \`request\` (url, method, headers, body).

Example step for a JWT login:
\`\`\`json
{
  "name": "login",
  "request": {
    "url": "${baseUrl}/api/auth/login",
    "method": "POST",
    "headers": [{"name": "Content-Type", "value": "application/json"}],
    "body": "{\\"email\\":\\"admin@example.com\\",\\"password\\":\\"admin123\\"}"
  }
}
\`\`\`

### Embedders — injecting the token into scan requests
After the step executes, you need to extract the token from the response and inject it.
The embedder \`template\` field uses Bright's NexTemplate interpolation syntax.

#### NexTemplate syntax (CRITICAL — follow exactly):
- Must start with \`auth_object\` prefix
- Reference stages by step name: \`auth_object.stages.<stepName>.response.body\`
- Use pipe \`|\` functions to extract values: \`get\`, \`match\`, \`encode\`
- Always wrapped in double curly braces: \`{{ ... }}\`

#### Common template patterns:

**JWT token from JSON response body** (e.g. response: \`{"token":"eyJ..."}\`):
\`Bearer {{ auth_object.stages.login.response.body | match: /"token"\\s*:\\s*"([^"]*)"/ }}\`

**Session ID from Set-Cookie header**:
\`{{ auth_object.stages.login.response.headers | get: '/Set-Cookie' | match: /sessionId=([^;]*)/ }}\`

**Token from nested JSON** (e.g. \`{"data":{"accessToken":"..."}}\`):
\`Bearer {{ auth_object.stages.login.response.body | match: /"accessToken"\\s*:\\s*"([^"]*)"/ }}\`

**Use \`any\` to search across all stages**:
\`Bearer {{ auth_object.stages.any.response.body | match: /"token"\\s*:\\s*"([^"]*)"/ }}\`

#### Embedder example for Authorization header:
\`\`\`json
{
  "type": "header",
  "name": "Authorization",
  "template": "Bearer {{ auth_object.stages.login.response.body | match: /\\"token\\"\\\\s*:\\\\s*\\"([^\\"]*)\\"/ }}"
}
\`\`\`

### Session verification (test field)
The \`test\` field defines a request to a protected endpoint that Bright uses to check if the session is still valid.

### Re-auth triggers (reauthTriggers)
Define when to re-authenticate. Common: status 401/403.
\`\`\`json
[{"type": "TRIGGER", "location": "status", "statuses": [401, 403]}]
\`\`\`

### Success response detection
Rules to confirm login succeeded. Common: status 200.
\`\`\`json
[{"type": "status", "statuses": [200]}]
\`\`\`

## Complete multistep addAuth example:
\`\`\`json
{
  "name": "JWT Login Auth",
  "projectId": "${projectId}",
  "type": "multistep",
  "test": {
    "request": {
      "method": "GET",
      "url": "${baseUrl}/api/some-protected-endpoint"
    },
    "repeaterId": "${repeaterId}"
  },
  "successResponseDetection": [{"type": "status", "statuses": [200]}],
  "reauthTriggers": [{"type": "TRIGGER", "location": "status", "statuses": [401, 403]}],
  "config": {
    "multistep": {
      "steps": [
        {
          "name": "login",
          "request": {
            "url": "${baseUrl}/api/auth/login",
            "method": "POST",
            "headers": [{"name": "Content-Type", "value": "application/json"}],
            "body": "{\\"email\\":\\"test@example.com\\",\\"password\\":\\"password123\\"}"
          },
          "successResponseDetection": [{"type": "status", "statuses": [200, 201]}]
        }
      ],
      "embedders": [
        {
          "type": "header",
          "name": "Authorization",
          "template": "Bearer {{ auth_object.stages.login.response.body | match: /\\"token\\"\\\\s*:\\\\s*\\"([^\\"]*)\\"/ }}"
        }
      ]
    }
  }
}
\`\`\`

## Your job:
1. Analyze the codebase to find ALL distinct authentication mechanisms
2. Determine which endpoints are public vs protected
3. Find the login endpoint, credentials format, and response shape (where the token/session is)
4. Create auth objects using addAuth — prefer "multistep" for login-based auth
5. Map each protected endpoint to its auth object ID

IMPORTANT: Look at the actual login endpoint handler to understand the response body shape
(what field name the token is under, e.g. "token", "accessToken", "access_token", "jwt", etc.)
and build the correct \`match\` regex for the embedder template.`,
    },
    {
      role: "user",
      content: `Analyze auth for this application and configure it in Bright.

Known endpoints:
${endpointSummary}

After analysis, respond with ONLY a JSON object:
{
  "endpointAuth": {
    "GET /api/users": "auth-object-id-1",
    "POST /api/admin/config": "auth-object-id-2"
  }
}

Rules:
- Keys are "METHOD /path" exactly as listed above
- Values are the auth object IDs returned by addAuth
- OMIT endpoints that don't require auth (public endpoints)
- If NO endpoints require auth, return: {"endpointAuth": {}}`,
    },
  ];

  const response = await chatWithTools(llm, messages, tools, handler, "gpt-4o", 30);

  try {
    const parsed = JSON.parse(extractJson(response));
    const endpointAuthMap: Record<string, string> = parsed.endpointAuth ?? {};
    const hasAuth = Object.keys(endpointAuthMap).length > 0;

    if (hasAuth) {
      const uniqueAuths = new Set(Object.values(endpointAuthMap));
      console.log(
        `[Auth] Configured ${uniqueAuths.size} auth object(s) for ${Object.keys(endpointAuthMap).length} endpoints`,
      );
    } else {
      console.log("[Auth] No auth required");
    }

    return { endpointAuthMap, hasAuth };
  } catch {
    console.warn("[Auth] Could not parse LLM response, assuming no auth:", response.slice(0, 200));
    return { endpointAuthMap: {}, hasAuth: false };
  }
}
