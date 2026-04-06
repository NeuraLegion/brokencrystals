import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

export function findControllerFilesPrompt(
  techStack: string,
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `You are a backend code analyst. Given a repository with the tech stack: ${techStack}, identify all files that define HTTP endpoints (routes, controllers, handlers). Use the list_files and read_file tools to explore the codebase.

Look for:
- Route definition files (Express router files, Django urls.py, Rails routes.rb, Spring @RestController, Gin router setup, etc.)
- Controller/handler files that contain HTTP method decorators or route registrations
- API definition files

Return a JSON array of file paths.`,
    },
    {
      role: "user",
      content: `Find all files that define HTTP endpoints in this repository. Use list_files to explore the directory structure, then read_file to confirm files contain route definitions.

Return a JSON array of relative file paths:
["src/routes/users.ts", "src/routes/auth.ts"]`,
    },
  ];
}

export function discoverEndpointsPrompt(
  techStack: string,
  fileContent: string,
  filePath: string,
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `You are an HTTP endpoint analyst for a ${techStack} application. Given a source file, extract all HTTP endpoints defined in it.`,
    },
    {
      role: "user",
      content: `Analyze this file and extract all HTTP endpoints.

File: ${filePath}
\`\`\`
${fileContent}
\`\`\`

For each endpoint, provide:
- method: HTTP method (GET, POST, PUT, DELETE, PATCH, etc.)
- path: URL path (e.g. /api/users/:id)
- filePath: the source file path

Return a JSON array:
[{ "method": "GET", "path": "/api/users", "filePath": "${filePath}" }]`,
    },
  ];
}

export function identifyParametersPrompt(
  techStack: string,
  endpoint: { method: string; path: string; filePath: string },
  fileContent: string,
): ChatCompletionMessageParam[] {
  const needsBody = ["POST", "PUT", "PATCH"].includes(endpoint.method.toUpperCase());
  return [
    {
      role: "system",
      content: `You are an API analyst for a ${techStack} application. Given an endpoint and its source code, identify all parameters it accepts and generate realistic sample values.

CRITICAL: For POST/PUT/PATCH endpoints, you MUST provide a realistic non-empty request body based on the DTO/schema/validation decorators in the code. Look for:
- Class-validator decorators (@IsString, @IsEmail, etc.)
- TypeScript interfaces or types used as @Body() parameter
- Swagger/OpenAPI decorators (@ApiBody, @ApiProperty)
- Mongoose/TypeORM/Prisma schemas referenced by the handler
- Direct property access on req.body`,
    },
    {
      role: "user",
      content: `Analyze this endpoint and identify ALL its parameters with realistic sample values:

Endpoint: ${endpoint.method} ${endpoint.path}
File: ${endpoint.filePath}

\`\`\`
${fileContent}
\`\`\`

${needsBody ? `This is a ${endpoint.method} endpoint — you MUST provide a realistic body with actual field names and sample values based on the code. DO NOT return an empty body "{}".` : "This endpoint likely does not use a request body. Set body to null."}

Return a JSON object with:
- body: ${needsBody ? 'A JSON string with realistic sample data based on the code (e.g. a login endpoint should have email and password fields)' : "An empty string if no body"}
- contentType: "application/json" for JSON APIs, or appropriate content type, or empty string
- hasQueryParams: true if the endpoint accepts query parameters, false otherwise
- queryParamsList: array of {name, value} objects for query parameters, or empty array`,
    },
  ];
}

export const controllerFilesSchema = {
  type: "object" as const,
  properties: {
    files: { type: "array" as const, items: { type: "string" as const } },
  },
  required: ["files"] as const,
  additionalProperties: false,
};

export const endpointsSchema = {
  type: "object" as const,
  properties: {
    endpoints: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          method: { type: "string" as const },
          path: { type: "string" as const },
          filePath: { type: "string" as const },
        },
        required: ["method", "path", "filePath"] as const,
        additionalProperties: false,
      },
    },
  },
  required: ["endpoints"] as const,
  additionalProperties: false,
};

export const endpointParamsSchema = {
  type: "object" as const,
  properties: {
    body: { type: "string" as const, description: "JSON request body string, or empty string if no body" },
    contentType: { type: "string" as const, description: "Content type, or empty string if none" },
    hasQueryParams: { type: "boolean" as const },
    queryParamsList: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
          value: { type: "string" as const },
        },
        required: ["name", "value"] as const,
        additionalProperties: false,
      },
    },
  },
  required: ["body", "contentType", "hasQueryParams", "queryParamsList"] as const,
  additionalProperties: false,
};
