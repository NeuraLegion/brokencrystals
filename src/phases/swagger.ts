import type { TechStack, DiscoveredEndpoint } from "../types.js";

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
// 3. High-level: probe for existing Swagger spec (no injection)
// ---------------------------------------------------------------------------

export interface SwaggerDiscoveryResult {
  endpoints: DiscoveredEndpoint[];
  source: "existing-spec" | "none";
}

/**
 * Attempt to discover endpoints via an existing Swagger/OpenAPI spec.
 * Probes the running application at well-known paths and parses the spec.
 */
export async function discoverEndpointsViaSwagger(
  baseUrl: string,
): Promise<SwaggerDiscoveryResult> {
  console.log("[Swagger] Probing for existing OpenAPI/Swagger spec...");
  const probe = await probeSwaggerSpec(baseUrl);
  if (probe.found && probe.spec) {
    const endpoints = parseOpenApiToEndpoints(probe.spec);
    if (endpoints.length > 0) {
      console.log(
        `[Swagger] Parsed ${endpoints.length} endpoints from existing spec at ${probe.specUrl}`,
      );
      return { endpoints, source: "existing-spec" };
    }
  }
  console.log("[Swagger] No existing spec found");
  return { endpoints: [], source: "none" };
}
