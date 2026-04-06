import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

export function detectAuthPrompt(
  techStack: string,
  endpointSummary: string,
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `You are a security analyst reviewing a ${techStack} application. Determine whether the application's HTTP endpoints require authentication, and if so, what kind.

Look for:
- Auth middleware (passport, jwt, express-jwt, auth guards, Spring Security, etc.)
- Login/signup endpoints
- API key validation
- Session/cookie-based auth
- OAuth/OIDC configuration
- Auth-related environment variables or config

You have tools to read files and search the codebase.`,
    },
    {
      role: "user",
      content: `Analyze the authentication requirements for this application.

Known endpoints:
${endpointSummary}

Use the tools to examine middleware, auth config, and route guards.

Return a JSON object:
{
  "requiresAuth": true/false,
  "authType": "jwt" | "api_key" | "session" | "basic" | "oauth" | "none",
  "loginEndpoint": "/api/auth/login" or null,
  "loginMethod": "POST" or null,
  "loginBody": "{\\"email\\":\\"test@example.com\\",\\"password\\":\\"test123\\"}" or null,
  "headerName": "Authorization" or null,
  "headerTemplate": "Bearer {{token}}" or null,
  "tokenJsonPath": "$.token" or null,
  "notes": "description of auth mechanism"
}`,
    },
  ];
}

export const authDetectionSchema = {
  type: "object" as const,
  properties: {
    requiresAuth: { type: "boolean" as const },
    authType: {
      type: "string" as const,
      enum: ["jwt", "api_key", "session", "basic", "oauth", "none"],
    },
    loginEndpoint: { type: ["string", "null"] as const },
    loginMethod: { type: ["string", "null"] as const },
    loginBody: { type: ["string", "null"] as const },
    headerName: { type: ["string", "null"] as const },
    headerTemplate: { type: ["string", "null"] as const },
    tokenJsonPath: { type: ["string", "null"] as const },
    notes: { type: "string" as const },
  },
  required: ["requiresAuth", "authType", "notes"] as const,
  additionalProperties: false,
};

export interface AuthDetection {
  requiresAuth: boolean;
  authType: string;
  loginEndpoint?: string | null;
  loginMethod?: string | null;
  loginBody?: string | null;
  headerName?: string | null;
  headerTemplate?: string | null;
  tokenJsonPath?: string | null;
  notes: string;
}
