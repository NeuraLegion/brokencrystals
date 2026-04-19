import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

/** Framework-specific Dockerfile hints keyed by lowercase tech-stack keywords. */
const FRAMEWORK_HINTS: Array<{ keywords: string[]; hint: string }> = [
  {
    keywords: ["ruby", "rails"],
    hint: `- Rails apps with JavaScript frontends need BOTH Ruby AND Node.js/pnpm in the same build environment. Prefer a single-stage Dockerfile for dev/test.
- If the project has bin/docker/ scripts, those use "docker exec -it" which fails in CI — call commands directly instead.
- Native extensions (psych, nokogiri) need dev headers: libyaml-dev, libxml2-dev, libxslt-dev, build-essential.`,
  },
  {
    keywords: ["typescript", "node", "express", "nestjs", "next"],
    hint: `- TypeScript's "tsc" may exit non-zero even with "--noEmitOnError false". Append "|| true" if it's just type warnings.
- In monorepos, read pnpm-workspace.yaml or package.json workspaces to understand the project structure before writing COPY lines.`,
  },
  {
    keywords: [".net", "c#", "aspnet", "dotnet"],
    hint: `- For multi-project solutions, find and publish the correct runnable web API project, not orchestrators (AppHost, ServiceDefaults, Aspire).`,
  },
];

function getFrameworkHints(techStack: string): string {
  const lower = techStack.toLowerCase();
  const hints = FRAMEWORK_HINTS
    .filter((fh) => fh.keywords.some((kw) => lower.includes(kw)))
    .map((fh) => fh.hint);
  return hints.length > 0
    ? `\n\nFramework-specific guidance for this stack:\n${hints.join("\n")}`
    : "";
}

export function generateDockerfilePrompt(
  techStack: string,
): ChatCompletionMessageParam[] {
  const frameworkHints = getFrameworkHints(techStack);
  return [
    {
      role: "system",
      content: `You are a DevOps engineer. Generate a Dockerfile for a ${techStack} project so it can be built and run in a Docker container for DEVELOPMENT/TESTING (not production).

If the tech stack description says "(service: <path>)", this is a monorepo. Build and run THAT specific service.

You have tools to read files, list directories, and verify Docker image tags. Use them to inspect:
1. Dependency manifests (package.json, Gemfile, requirements.txt, .csproj, go.mod, pom.xml, etc.)
2. Build configuration and scripts
3. The application entry point and port
4. Monorepo structure (pnpm-workspace.yaml, package.json workspaces, etc.)

IMPORTANT: Use verify_docker_image to check that base image:tag EXISTS before including it in a FROM line.

Principles:
- BUILD FROM SOURCE. All compilation, asset building, and dependency installation must happen from the local source code inside the container. Never rely on downloading pre-built artifacts, binaries, or asset bundles from external URLs during the build.
- Prefer a SINGLE-STAGE Dockerfile. Multi-stage adds complexity that often breaks (missing tools/files across stages). Only use multi-stage if you have a clear reason.
- If the project needs BOTH a backend runtime (Ruby, Python, etc.) AND a JS build tool (Node, pnpm, etc.), install them ALL in the same stage. Asset compilation steps (e.g. rake assets:precompile) often shell out to node/pnpm — they must be available.
- Use "COPY . ." for source code instead of cherry-picking individual directories — you will miss required files.
- Copy dependency manifests FIRST and install dependencies for layer caching, then COPY the rest.
- Install git if any build step might need it.
- EXPOSE the correct port and set CMD to start the application.${frameworkHints}

Return ONLY the Dockerfile content inside a single fenced code block. No explanation outside the code block.`,
    },
    {
      role: "user",
      content: `Analyze this project and generate a Dockerfile for it. Use the tools to inspect the project's files and determine the right configuration.`,
    },
  ];
}
