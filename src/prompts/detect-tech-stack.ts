import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

export function detectTechStackPrompt(
  repoFiles: string,
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `You are a software architecture analyst. Analyze a repository's file structure and configuration files to identify the technology stack. You have tools to read files and list directories. Use them to inspect configuration files (package.json, go.mod, requirements.txt, Gemfile, pom.xml, Cargo.toml, Dockerfile, docker-compose.yml, etc.) to determine:

1. Programming languages used (from file extensions and config)
2. Backend web frameworks (Express, Fastify, Django, Flask, Rails, Spring, Gin, etc.)
3. Databases used (from config, dependencies, or ORM models)

Return your analysis as a JSON object.`,
    },
    {
      role: "user",
      content: `Analyze this repository to identify the technology stack.

Here is the top-level file listing:
${repoFiles}

Use the read_file and list_files tools to inspect configuration and dependency files.
Return a JSON object with this exact format:
{
  "languages": ["language1", "language2"],
  "frameworks": ["framework1"],
  "databases": ["database1"]
}`,
    },
  ];
}

export const techStackSchema = {
  type: "object" as const,
  properties: {
    languages: { type: "array" as const, items: { type: "string" as const } },
    frameworks: { type: "array" as const, items: { type: "string" as const } },
    databases: { type: "array" as const, items: { type: "string" as const } },
  },
  required: ["languages", "frameworks", "databases"] as const,
  additionalProperties: false,
};
