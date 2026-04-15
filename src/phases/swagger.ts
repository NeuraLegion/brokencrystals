import type OpenAI from "openai";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { execSync } from "child_process";
import type { TechStack, DiscoveredEndpoint } from "../types.js";
import { chatWithTools, chatWithSchema } from "../inference.js";
import { codebaseTools, createToolHandler } from "../tools.js";
import { formatTechStack } from "../utils.js";

// ---------------------------------------------------------------------------
// Common Swagger / OpenAPI spec paths (ordered roughly by popularity)
// ---------------------------------------------------------------------------

const SWAGGER_PATHS = [
  // OpenAPI 3.x
  "/openapi.json",
  "/openapi.yaml",
  "/api/openapi.json",
  "/v3/api-docs",
  "/docs/openapi.json",
  // Swagger 2.x
  "/swagger.json",
  "/swagger/v1/swagger.json",
  "/swagger/v2/swagger.json",
  "/api-docs",
  "/api-docs.json",
  "/v2/api-docs",
  // FastAPI
  "/openapi.json",
  // NestJS / @nestjs/swagger
  "/api",
  "/api-json",
  // .NET
  "/swagger/v1/swagger.json",
  // Rails rswag
  "/api-docs/v1/swagger.json",
];

// De-duplicate paths (some overlap on purpose for readability above)
const UNIQUE_SWAGGER_PATHS = [...new Set(SWAGGER_PATHS)];

// ---------------------------------------------------------------------------
// 1. Probe for existing Swagger / OpenAPI spec
// ---------------------------------------------------------------------------

export interface SwaggerProbeResult {
  found: boolean;
  specUrl?: string;
  spec?: Record<string, unknown>;
}

export async function probeSwaggerSpec(
  baseUrl: string,
): Promise<SwaggerProbeResult> {
  for (const path of UNIQUE_SWAGGER_PATHS) {
    const url = `${baseUrl.replace(/\/$/, "")}${path}`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;

      const text = await res.text();
      // Must look like JSON with OpenAPI/Swagger markers
      if (!text.startsWith("{") && !text.startsWith("[")) continue;

      const spec = JSON.parse(text);
      if (spec.openapi || spec.swagger || spec.paths) {
        console.log(`[Swagger] Found OpenAPI spec at ${url}`);
        return { found: true, specUrl: url, spec };
      }
    } catch {
      // timeout, parse error, etc. — try next path
    }
  }
  return { found: false };
}

// ---------------------------------------------------------------------------
// 2. Parse OpenAPI spec → DiscoveredEndpoint[]
// ---------------------------------------------------------------------------

export function parseOpenApiToEndpoints(
  spec: Record<string, unknown>,
): DiscoveredEndpoint[] {
  const endpoints: DiscoveredEndpoint[] = [];
  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths) return endpoints;

  // Extract base path from servers[0] or basePath (Swagger 2)
  let basePath = "";
  if (spec.servers && Array.isArray(spec.servers) && spec.servers.length > 0) {
    const serverUrl = (spec.servers[0] as { url?: string })?.url ?? "";
    try {
      basePath = new URL(serverUrl).pathname.replace(/\/$/, "");
    } catch {
      // Relative path like "/api/v1"
      basePath = serverUrl.replace(/\/$/, "");
    }
  } else if (typeof spec.basePath === "string") {
    basePath = (spec.basePath as string).replace(/\/$/, "");
  }

  for (const [pathTemplate, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== "object") continue;

    for (const [method, operation] of Object.entries(methods)) {
      const httpMethod = method.toUpperCase();
      if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(httpMethod)) {
        continue;
      }

      const op = operation as {
        parameters?: Array<{
          name: string;
          in: string;
          schema?: { type?: string; example?: unknown; default?: unknown };
          example?: unknown;
        }>;
        requestBody?: {
          content?: Record<string, { schema?: Record<string, unknown> }>;
        };
      };

      // Build the path — replace {param} with :param for consistency
      const normalizedPath = (basePath + pathTemplate).replace(
        /\{(\w+)\}/g,
        ":$1",
      );

      // Extract query params
      const queryParams: Array<{ name: string; value: string }> = [];
      const pathParams: Record<string, string> = {};
      for (const param of op.parameters ?? []) {
        const sampleValue = String(
          param.example ??
            param.schema?.example ??
            param.schema?.default ??
            sampleForType(param.schema?.type),
        );
        if (param.in === "query") {
          queryParams.push({ name: param.name, value: sampleValue });
        } else if (param.in === "path") {
          pathParams[param.name] = sampleValue;
        }
      }

      // Substitute path params with sample values
      let resolvedPath = normalizedPath;
      for (const [name, value] of Object.entries(pathParams)) {
        resolvedPath = resolvedPath.replace(`:${name}`, value);
      }

      // Extract request body
      let body: string | undefined;
      let contentType: string | undefined;
      if (op.requestBody?.content) {
        const jsonContent = op.requestBody.content["application/json"];
        if (jsonContent?.schema) {
          contentType = "application/json";
          body = JSON.stringify(generateSampleFromSchema(jsonContent.schema));
        } else {
          // Take whatever content type is first
          const [ct, def] = Object.entries(op.requestBody.content)[0] ?? [];
          if (ct && def?.schema) {
            contentType = ct;
            body = JSON.stringify(generateSampleFromSchema(def.schema));
          }
        }
      }

      endpoints.push({
        method: httpMethod,
        path: resolvedPath,
        filePath: "openapi-spec",
        queryParams: queryParams.length > 0 ? queryParams : undefined,
        body,
        contentType,
      });
    }
  }

  return endpoints;
}

/** Generate a sample value for a given JSON Schema type */
function sampleForType(type?: string): string | number | boolean {
  switch (type) {
    case "integer":
      return 1;
    case "number":
      return 1.0;
    case "boolean":
      return true;
    case "array":
      return "[]";
    default:
      return "example";
  }
}

/** Generate a sample JSON object from an OpenAPI schema */
function generateSampleFromSchema(
  schema: Record<string, unknown>,
  depth = 0,
): unknown {
  if (depth > 5) return {};

  // Handle $ref — we won't resolve it here, just return a placeholder
  if (schema.$ref) return {};

  if (schema.example !== undefined) return schema.example;

  const type = schema.type as string | undefined;

  if (type === "object" || schema.properties) {
    const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
    if (!props) return {};
    const result: Record<string, unknown> = {};
    for (const [key, propSchema] of Object.entries(props)) {
      result[key] = generateSampleFromSchema(propSchema, depth + 1);
    }
    return result;
  }

  if (type === "array") {
    const items = schema.items as Record<string, unknown> | undefined;
    if (items) return [generateSampleFromSchema(items, depth + 1)];
    return [];
  }

  if (type === "string") {
    if (schema.enum && Array.isArray(schema.enum)) return schema.enum[0];
    if (schema.format === "email") return "user@example.com";
    if (schema.format === "date") return "2024-01-15";
    if (schema.format === "date-time") return "2024-01-15T10:30:00Z";
    if (schema.format === "uuid") return "550e8400-e29b-41d4-a716-446655440000";
    if (schema.format === "uri") return "https://example.com";
    return "string";
  }

  if (type === "integer") return schema.example ?? 1;
  if (type === "number") return schema.example ?? 1.0;
  if (type === "boolean") return schema.example ?? true;

  return "example";
}

// ---------------------------------------------------------------------------
// 3. Inject Swagger support into the application via LLM
// ---------------------------------------------------------------------------

/** Framework → swagger library mapping for the LLM prompt */
const SWAGGER_LIBRARIES: Record<string, string> = {
  Express: "swagger-jsdoc + swagger-ui-express",
  Fastify: "@fastify/swagger + @fastify/swagger-ui",
  Koa: "koa2-swagger-ui + swagger-jsdoc",
  NestJS: "@nestjs/swagger",
  "Next.js": "next-swagger-doc + swagger-ui-react",
  "ASP.NET": "Swashbuckle.AspNetCore (usually pre-installed)",
  "Spring Boot": "springdoc-openapi-starter-webmvc-ui",
  Flask: "flask-restx or flasgger",
  FastAPI: "Built-in (already at /openapi.json)",
  Django: "drf-spectacular",
  Rails: "rswag-api + rswag-ui",
  Go: "swaggo/swag + gin-swagger (for Gin) or echo-swagger",
  Laravel: "darkaonline/l5-swagger",
};

const injectSwaggerResultSchema = {
  type: "object" as const,
  properties: {
    files: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          path: {
            type: "string" as const,
            description: "Relative file path to create or modify",
          },
          content: {
            type: "string" as const,
            description: "Complete file content after modification",
          },
        },
        required: ["path", "content"] as const,
        additionalProperties: false,
      },
      description: "Files to create or overwrite",
    },
    installCommand: {
      type: "string" as const,
      description:
        "Shell command to install the swagger library (e.g. npm install swagger-jsdoc swagger-ui-express)",
    },
    swaggerPath: {
      type: "string" as const,
      description:
        "The URL path where the JSON spec will be served (e.g. /api-docs, /swagger.json)",
    },
  },
  required: ["files", "installCommand", "swaggerPath"] as const,
  additionalProperties: false,
};

interface SwaggerInjectionResult {
  files: Array<{ path: string; content: string }>;
  installCommand: string;
  swaggerPath: string;
}

/**
 * Use LLM to add Swagger/OpenAPI generation to the application.
 * Returns the spec path to probe after rebuild, or null if injection failed.
 */
export async function injectSwaggerSupport(
  llm: OpenAI,
  repoPath: string,
  techStack: TechStack,
  model?: string,
): Promise<string | null> {
  const stackStr = formatTechStack(techStack);
  const handleTool = createToolHandler(repoPath);

  // Build framework-specific hint
  const frameworkHints = techStack.frameworks
    .map((fw) => {
      const lib = Object.entries(SWAGGER_LIBRARIES).find(([k]) =>
        fw.toLowerCase().includes(k.toLowerCase()),
      );
      return lib ? `${fw}: use ${lib[1]}` : null;
    })
    .filter(Boolean)
    .join("\n");

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    {
      role: "system",
      content: `You are an expert at adding Swagger/OpenAPI auto-generation to web applications.
Your task: add the minimal code to make this application serve a JSON OpenAPI spec at a well-known path.

Tech stack: ${stackStr}
${frameworkHints ? `\nRecommended libraries:\n${frameworkHints}` : ""}

RULES:
1. Use the tools to read the application's entry point and routing files to understand the existing structure.
2. Make MINIMAL changes — only add the swagger library registration/middleware.
3. The spec MUST be auto-generated from the existing routes (not hand-written).
4. Prefer libraries that auto-discover routes without needing JSDoc annotations.
5. Do NOT modify existing route handlers.
6. Return the COMPLETE content of each file you modify (not just the diff).
7. Return the install command for the swagger library.
8. Return the URL path where the JSON spec will be available.`,
    },
    {
      role: "user",
      content: `Add Swagger/OpenAPI auto-generation to this ${stackStr} application.

Read the entry point and routing setup, then provide the minimal file changes to add a swagger spec endpoint. Focus on auto-discovering existing routes.`,
    },
  ];

  try {
    // Let LLM explore the codebase to understand the app structure
    const exploration = await chatWithTools(
      llm,
      messages,
      codebaseTools,
      handleTool,
      model,
      8,
    );

    // Now get the structured result
    const result = (await chatWithSchema(
      llm,
      [
        ...messages,
        { role: "assistant" as const, content: exploration },
        {
          role: "user",
          content:
            "Now return the exact file changes, install command, and swagger spec URL path as structured JSON.",
        },
      ],
      "swagger_injection",
      injectSwaggerResultSchema,
      model,
    )) as SwaggerInjectionResult;

    if (!result.files || result.files.length === 0) {
      console.warn("[Swagger] LLM returned no file changes");
      return null;
    }

    // Apply file changes
    for (const file of result.files) {
      const fullPath = resolve(repoPath, file.path);
      // Security: block path traversal
      if (!fullPath.startsWith(repoPath)) {
        console.warn(`[Swagger] Blocked path traversal: ${file.path}`);
        continue;
      }
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, file.content, "utf-8");
      console.log(`[Swagger] Wrote ${file.path}`);
    }

    // Run install command
    if (result.installCommand) {
      console.log(`[Swagger] Running: ${result.installCommand}`);
      try {
        execSync(result.installCommand, {
          cwd: repoPath,
          stdio: "pipe",
          timeout: 120_000,
          env: { ...process.env, NODE_ENV: undefined },
        });
      } catch (err) {
        console.warn(
          `[Swagger] Install command failed: ${err instanceof Error ? err.message : err}`,
        );
        // Non-fatal — the dependency might already be installed or the
        // framework has built-in support
      }
    }

    const specPath = result.swaggerPath || "/swagger.json";
    console.log(`[Swagger] Injection complete — spec expected at ${specPath}`);
    return specPath;
  } catch (err) {
    console.warn(
      `[Swagger] Failed to inject swagger support: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// 4. High-level: try to get endpoints from Swagger, with injection fallback
// ---------------------------------------------------------------------------

export interface SwaggerDiscoveryResult {
  endpoints: DiscoveredEndpoint[];
  source: "existing-spec" | "injected-spec" | "none";
  needsRebuild: boolean;
  specPath?: string;
}

/**
 * Attempt to discover endpoints via Swagger/OpenAPI spec.
 *
 * Call flow:
 * 1. Probe the running app for an existing spec → parse it
 * 2. If not found, inject swagger support via LLM → signal caller to rebuild
 * 3. After rebuild, caller probes again with probeSwaggerSpec + parseOpenApiToEndpoints
 */
export async function discoverEndpointsViaSwagger(
  llm: OpenAI,
  repoPath: string,
  techStack: TechStack,
  baseUrl: string,
  model?: string,
): Promise<SwaggerDiscoveryResult> {
  // Step 1: Probe for existing spec
  console.log("[Swagger] Probing for existing OpenAPI/Swagger spec...");
  const probe = await probeSwaggerSpec(baseUrl);
  if (probe.found && probe.spec) {
    const endpoints = parseOpenApiToEndpoints(probe.spec);
    if (endpoints.length > 0) {
      console.log(
        `[Swagger] Parsed ${endpoints.length} endpoints from existing spec at ${probe.specUrl}`,
      );
      return { endpoints, source: "existing-spec", needsRebuild: false };
    }
  }
  console.log("[Swagger] No existing spec found — attempting injection");

  // Step 2: Inject swagger support
  const specPath = await injectSwaggerSupport(llm, repoPath, techStack, model);
  if (!specPath) {
    return { endpoints: [], source: "none", needsRebuild: false };
  }

  // Signal caller that a rebuild + restart is needed, then probe again
  return {
    endpoints: [],
    source: "injected-spec",
    needsRebuild: true,
    specPath,
  };
}
