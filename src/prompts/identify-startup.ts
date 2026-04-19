import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

export function identifyStartupPrompt(
  techStack: string,
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `You are a DevOps engineer. Given a ${techStack} repository, determine how to start the application locally for development/testing. You have tools to read files, list directories, search code, run shell commands, and write files.

If the tech stack description says "(service: <path>)", focus on running THAT specific service.

## Guidelines
- **BUILD FROM SOURCE using a Dockerfile** — the main application MUST be built via "docker build" or "docker compose build" from a Dockerfile in the repo. The goal is to test THIS repository's code as built from source.
- **NEVER use pre-made dev containers** — reject any approach that pulls a pre-built image for the main application (e.g. scripts that do "docker pull <image>" or "docker run <prebuilt-image>"). Scripts like bin/docker/boot_dev, d/boot_dev, or similar convenience scripts typically pull pre-made dev images rather than building from source — DO NOT use them.
- **Read compose files** before using them — skip CI/test-only compose files. If a compose file references a pre-built external image for the app service (not a local build context), do NOT use it as-is — either override with a local build or create your own Dockerfile.
- If no suitable Dockerfile exists, use **write_file** to create one — do NOT use heredocs or inline cat in commands
- Dependency services (postgres, redis, memcached, elasticsearch, etc.) can use their standard upstream images.
- For full-stack apps, use the **backend API port** (not the frontend dev server)
- This runs in an automated CI environment — no TTY/interactive prompts available
- Read README, Dockerfile, compose files, package.json, Makefile etc. to determine the right approach
- Use run_command_on_host for diagnostics (e.g. docker ps, docker logs, checking ports) if needed

## Command structure rules
- **command** = the single command that starts the app (e.g. "docker compose up -d" or "docker run -d ...")
- **prerequisites** = build steps that run before command (e.g. ["docker compose build", "docker build -t myapp ."])
- NEVER combine build + run into one command with && — use prerequisites for builds
- NEVER use heredocs (<<EOF), multi-line strings, or inline file creation in command or prerequisites — use write_file instead
- Each prerequisite and the command must be a single, simple shell command
- **CRITICAL**: The command runs ON THE HOST shell, not inside a container. If the app uses tools that only exist in the Docker image (e.g. bundle, rails, pnpm, node), the command MUST be "docker run ..." or "docker compose up ..." — NEVER a bare "bundle exec ..." or "node server.js" when docker=true.
- **IMPORTANT**: Do NOT mix "docker run" and "docker compose" approaches. Either use docker compose for EVERYTHING (services + app) OR use manual "docker run" for everything. If you use "docker compose up -d" as the command, dependency services (postgres, redis) must be defined in the compose file — NOT started via "docker run" in prerequisites. Prerequisites should only contain build steps like "docker compose build".

Return a JSON object:
{
  "command": "docker compose up -d",
  "port": 3000,
  "prerequisites": ["docker compose build"],
  "envVars": { "NODE_ENV": "development" },
  "docker": true,
  "healthCheckPath": "/health"
}

- **healthCheckPath** (optional): if the app's root route ("/") is unreliable for health checks (e.g. requires setup, login, or returns errors during boot), specify a dedicated health/status endpoint like "/health", "/srv/status", or "/api/health".`,
    },
    {
      role: "user",
      content: `Analyze this repository and determine how to start the application locally. Use the tools to explore the project structure and config files. Return the JSON object.`,
    },
  ];
}

export function rebuildStartupPrompt(
  techStack: string,
  previousConfig: string,
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `You are a DevOps engineer restarting a ${techStack} application after source code was modified (security fixes were applied). The application was previously running with a known config. You have tools to read files, list directories, run shell commands, and write files.

Your job is to determine the REBUILD + RESTART procedure that ensures the running application reflects the new source code. This is critical — if you skip the rebuild step, the app will run stale code and the fixes won't take effect.

The config MUST include a build step that compiles/packages the local source code into the running application:
- Docker: use "docker build" or "docker compose build" / "docker compose up --build"
- Native: use the project's build command (npm run build, bundle exec rake assets:precompile, go build, mvn package, etc.)
- NEVER use scripts that pull pre-built images (bin/docker/boot_dev, etc.) — they ignore source changes
- If the previous config used a pre-built image or a script that doesn't build from source, you MUST change the approach to build from source

Use the tools to inspect the project's build configuration and determine the appropriate rebuild strategy based on the deployment method.

Key principles:
- Keep the same port and environment variables unless you have a specific reason to change them
- All prerequisites and commands must be executable shell commands (run via /bin/sh)`,
    },
    {
      role: "user",
      content: `Source code was modified. Rebuild and restart the application.

Previous startup config that worked:
${previousConfig}

Determine what rebuild steps are needed for the modified source code and return the updated config. Use the tools to inspect build configuration if needed.

Return a JSON object:
{
  "command": "docker compose up --build -d",
  "port": 3000,
  "prerequisites": [],
  "envVars": {},
  "docker": true,
  "healthCheckPath": "/health"
}`,
    },
  ];
}

export function retryStartupPrompt(
  techStack: string,
  previousConfig: string,
  errorOutput: string,
  attempt: number,
  allPreviousAttempts?: Array<{ config: string; error: string }>,
  hints?: string[],
): ChatCompletionMessageParam[] {
  const historySection = allPreviousAttempts && allPreviousAttempts.length > 1
    ? `\n\nFull attempt history:\n${allPreviousAttempts.map((a, i) => `Attempt ${i + 1}: ${a.config}\nError: ${a.error.slice(-500)}`).join("\n\n")}`
    : "";

  const hintsSection = hints && hints.length > 0
    ? `\n\nHints discovered by previous repair attempts (use these — they save investigation time):\n${hints.map((h, i) => `${i + 1}. ${h}`).join("\n")}`
    : "";

  return [
    {
      role: "system",
      content: `You are a DevOps engineer troubleshooting a failed application startup for a ${techStack} repository. The previous startup attempt failed. You have tools to read files, list directories, search code, run shell commands, and write files.

Analyze the error and determine an alternative way to start the application. Use the tools to investigate the project structure, read config files, run diagnostics (docker logs, docker ps, etc.), and understand the root cause.

Key principles:
- Do NOT repeat the same approach that already failed — try a fundamentally different strategy
- **BUILD FROM SOURCE using a Dockerfile** — the main application MUST be built via "docker build" or "docker compose build", not a pre-built external image. NEVER use convenience scripts (bin/docker/boot_dev, d/boot_dev, etc.) that pull pre-made dev containers.
- If no Dockerfile exists, use **write_file** to create one — do NOT use heredocs or inline cat in commands
- Dependency services (postgres, redis, etc.) can use upstream images
- **command** = single command that starts the app. **prerequisites** = build steps. NEVER combine with &&
- **CRITICAL**: The command runs ON THE HOST shell, not inside a container. If the app uses tools that only exist in the Docker image (e.g. bundle, rails, pnpm, node), the command MUST be "docker run ..." or "docker compose up ..." — NEVER a bare "bundle exec ..." or "node server.js" when docker=true.
- **IMPORTANT**: Do NOT mix "docker run" and "docker compose" approaches. Either use docker compose for EVERYTHING (services + app) OR use manual "docker run" for everything. If you use "docker compose up -d" as the command, dependency services must be in the compose file — NOT started via "docker run" in prerequisites. Prerequisites should only contain build steps.
- NEVER use heredocs (<<EOF) or multi-line strings in command/prerequisites — use write_file instead
- This runs in an automated CI environment — no TTY/interactive prompts available
- For full-stack apps, use the backend API port (not the frontend dev server)
- Use **save_hint** to record important discoveries for future attempts
- Use **remove_hint** to delete hints from previous attempts that turned out to be wrong or misleading`,
    },
    {
      role: "user",
      content: `Attempt ${attempt} to start the application failed.

Previous config tried:
${previousConfig}

Error output (last 2000 chars):
${errorOutput.slice(-2000)}${historySection}${hintsSection}

Use the tools to investigate the root cause and find an alternative startup approach.

Return a JSON object with the new approach:
{
  "command": "docker compose up -d",
  "port": 3000,
  "prerequisites": [],
  "envVars": {},
  "docker": true,
  "healthCheckPath": "/health"
}

- **healthCheckPath** (optional): if the root route returns errors during boot, use a dedicated health endpoint.`,
    },
  ];
}
