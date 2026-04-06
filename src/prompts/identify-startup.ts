import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

export function identifyStartupPrompt(
  techStack: string,
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `You are a DevOps engineer. Given a ${techStack} repository, determine how to start the application locally for development/testing. You have tools to read files and list directories.

Check for (in priority order):
1. Docker Compose files (compose.yml, docker-compose.yml, compose.local.yml) — PREFER Docker when the app has complex dependencies (databases, message queues, etc.)
2. Dockerfile with docker build + docker run
3. package.json scripts (start, dev, serve)
4. Makefile targets
5. README instructions
6. Python manage.py / wsgi.py
7. Go main.go
8. Gemfile + config.ru (Rails)

IMPORTANT: If the project has a docker-compose or compose file, strongly prefer using Docker unless the compose file requires external services that aren't defined in it. Docker avoids Node version incompatibilities and native module build issues.

For Docker Compose: use "docker compose -f <file> up -d" as the command and set docker=true. Parse the compose file to find the exposed port.

For non-Docker: determine prerequisites (npm install, pip install, etc.), the startup command, and the port.

Determine:
1. Prerequisites to run first (npm install, pip install, docker compose build, etc.)
2. The startup command
3. The port the application listens on
4. Whether it uses Docker
5. Required environment variables (provide sensible defaults for local dev)`,
    },
    {
      role: "user",
      content: `Analyze this repository and determine how to start the application locally.

Use the tools to inspect package.json, Dockerfile, docker-compose.yml, compose.yml, Makefile, README, and other config files.

Return a JSON object:
{
  "command": "npm start",
  "port": 3000,
  "prerequisites": ["npm install"],
  "envVars": { "NODE_ENV": "development", "PORT": "3000" },
  "docker": false
}`,
    },
  ];
}

export function retryStartupPrompt(
  techStack: string,
  previousConfig: string,
  errorOutput: string,
  attempt: number,
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `You are a DevOps engineer troubleshooting a failed application startup for a ${techStack} repository. The previous startup attempt failed. You have tools to read files and list directories.

Analyze the error and determine an alternative way to start the application. Common strategies:
- If npm install failed due to native modules or Node version issues, try Docker instead
- If Docker Compose failed, check for alternative compose files (compose.local.yml, docker-compose.dev.yml)
- If a port conflict occurred, try a different port
- If missing environment variables, check .env.example or README for required values
- If build failed, check if there's a pre-built option or different build command

IMPORTANT: Do NOT repeat the same approach that already failed. Try a fundamentally different strategy.`,
    },
    {
      role: "user",
      content: `Attempt ${attempt} to start the application failed.

Previous config tried:
${previousConfig}

Error output (last 2000 chars):
${errorOutput.slice(-2000)}

Use the tools to investigate and find an alternative startup approach.

Return a JSON object with the new approach:
{
  "command": "docker compose up -d",
  "port": 3000,
  "prerequisites": [],
  "envVars": {},
  "docker": true
}`,
    },
  ];
}
