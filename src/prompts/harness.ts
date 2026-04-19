import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";
import type { HarnessTarget } from "../types.js";

// ---------------------------------------------------------------------------
// Prompt 1: Identify critical functions for harness-based scanning
// ---------------------------------------------------------------------------

export function identifyHarnessTargetsPrompt(
  techStack: string,
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `You are a security engineer performing data-flow analysis on a ${techStack} codebase to identify functions that can be security-tested in **isolation** — WITHOUT the full application framework running.

## Your goal
Find **service-layer and utility functions** (NOT controller actions) that:
1. Accept user-controlled input (directly or indirectly)
2. Perform a security-sensitive operation (DB query, file I/O, HTTP request, XML parse, shell exec, template render, redirect, deserialization)
3. Can be called with **minimal** infrastructure — ideally ZERO framework boot

## CRITICAL: Target the RIGHT level
The key principle is to find functions CLOSE TO the dangerous operation, not high-level controllers.

### Bootstrapping tiers (prefer lower tiers)
- **Tier 1 (best)** — No framework boot required. Just \`require\`/\`import\` the specific file. Pure computation, URL validation, path construction, query string building, XML parsing, template rendering.
- **Tier 2 (good)** — Needs DB connection only. Can initialize an ORM connection directly without booting the full framework. Service methods that build/execute queries.
- **Tier 3 (avoid)** — Needs full framework boot (all initializers, middleware, caches, config). Controller actions, anything requiring full app context.

### Why this matters
Controller actions (e.g. SearchController#query) require the ENTIRE framework to boot — database, Redis, all initializers, config loading, migration checks, etc. This makes harnessing brittle and complex.
Service/utility methods (e.g. Search.execute(term), FileHelper.download(url)) can often be called by requiring just their file + any direct dependencies — no framework boot needed.

## How to find targets — data flow analysis
1. **Start from routes**: Read routing config to find HTTP endpoints.
2. **Trace THROUGH controllers**: Don't stop at the controller — follow the call chain deeper.
3. **Find the security-critical function**: The service, model, or utility method that ACTUALLY does the dangerous operation with user input.
4. **Verify it can be required standalone**: Check the file's imports — does it pull in the entire framework or just specific modules?

## What makes a GOOD target
- A search service method that takes a query string and builds a SQL query (e.g. \`Search.execute(term)\`, \`UserSearch.new(term).search\`)
- A URL/file utility that fetches from or validates user-provided URLs (e.g. \`FileHelper.download_url(url)\`, \`UrlHelper.validate(url)\`)
- A path construction method (e.g. \`Upload.get_path(sha, extension)\`)
- An XML/JSON parser that processes user content (e.g. \`XmlParser.parse(body)\`)
- A query builder or scope method (e.g. \`Topic.search_by_title(term)\`)
- A content sanitizer/renderer (e.g. \`PrettyText.cook(raw_markdown)\`)
- A method that constructs shell commands from user input

## What makes a BAD target
- **Controller actions** (e.g. SearchController#query, UploadsController#create) — require full framework boot
- Low-level ORM primitives (User.find, Model.save) — no input-handling context
- Auth middleware — can't test meaningfully
- Functions requiring a dozen services initialized
- Trivial getters/setters

## Infrastructure classification
For each function, determine what it needs. Be precise — "db" means it DIRECTLY uses the database, not that some caller somewhere needs a DB.
- "none" — pure computation, no external deps (string parsing, URL construction, XML parsing)
- "filesystem" — needs local file access
- "db" — directly queries/writes to database
- "http" — makes outbound HTTP requests

## Vulnerability mapping
- DB queries → sqli
- HTML/template output → xss
- File path construction → lfi
- URL fetching → ssrf, rfi
- XML parsing → xxe
- Shell command building → osi
- Redirect URL handling → unvalidated_redirect
- Deserialization → proto_pollution, mass_assignment
- File upload processing → file_upload

## Required files
For each target, list the MINIMAL set of require/import statements needed to call it — NOT the full framework bootstrap. Read the target file's actual imports to determine this.

## Output format
Return a JSON array of targets:
[
  {
    "name": "execute",
    "file": "lib/search.rb",
    "className": "Search",
    "params": [{"name": "term", "type": "string", "sample": "test query"}],
    "deps": ["db"],
    "vulnTypes": ["sqli"],
    "httpMethod": "GET",
    "description": "Executes search with user-provided term, builds SQL query",
    "requireStatements": ["require_relative 'lib/search'"],
    "tier": 2
  }
]

## Rules
- Return 5-15 targets, prioritized by: Tier 1 > Tier 2 >> Tier 3, then by security impact
- **NO controller actions** — always go at least one level deeper into services/utilities
- Each target must be a REAL function found in the codebase
- Include the exact file path
- Only include functions you've verified exist by reading the source code
- Include the \`tier\` field (1, 2, or 3) and \`requireStatements\` for each target`,
    },
    {
      role: "user",
      content:
        "Analyze this codebase for security-critical service/utility functions (NOT controller actions) that can be tested via a lightweight harness. Trace data flow from routes through controllers into the actual service/utility methods. Read the source files to verify each target can be required with minimal framework bootstrapping. Return the JSON array of targets.",
    },
  ];
}

// ---------------------------------------------------------------------------
// Prompt 2: Generate the harness server
// ---------------------------------------------------------------------------

export function generateHarnessPrompt(
  techStack: string,
  targets: HarnessTarget[],
  infraInfo: string,
): ChatCompletionMessageParam[] {
  const targetList = targets
    .map(
      (t, i) => {
        const pathSlug = `${t.className}-${t.name}`
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-");
        return `${i + 1}. ${t.className}.${t.name}(${t.params.map((p) => p.name).join(", ")}) — file: ${t.file}
   Deps: ${t.deps.join(", ")} | Vulns: ${t.vulnTypes.join(", ")} | Method: ${t.httpMethod}
   Route: /harness/${pathSlug}
   Params: ${JSON.stringify(t.params)}
   Desc: ${t.description}
   Tier: ${t.tier ?? "unknown"} | Requires: ${JSON.stringify(t.requireStatements ?? [])}`;
      },
    )
    .join("\n");

  return [
    {
      role: "system",
      content: `You are a security engineer generating a lightweight HTTP harness server for a ${techStack} project. The harness wraps specific functions so Bright's DAST engine can scan them without the full application running.

## Targets to wrap
${targetList}

## Infrastructure available
${infraInfo}

## Key requirements

1. **Minimal bootstrapping**: Each target has a \`tier\` and \`requireStatements\`. Tier 1 = no framework boot (just require the files). Tier 2 = DB connection only (no full framework). Tier 3 = avoid.

2. **Harness HTTP server**: Use a minimal framework (Sinatra for Ruby, Express for Node.js, Flask for Python) — NOT the app's own framework.

3. **Exact route paths**: Each target has a "Route:" field — use that EXACT path. The scanner registers these paths, so they must match.

4. **Response content type**: ALL endpoints MUST respond with \`text/plain\` (not text/html). The harness wraps backend functions, not HTML views. Returning HTML causes false-positive XSS/CSS injection findings.

5. **Resilient loading**: The harness MUST NOT crash if a target fails to load. Wrap each require/import in error handling. Skip failed targets, log a warning, and keep serving the ones that loaded.

6. **Error handling**: Catch exceptions in route handlers and return 500 with the error message. Add a \`GET /health\` that returns 200.

7. **Port**: Listen on PORT env var, defaulting to 3001.

## IMPORTANT: Read the actual source files
Before writing the harness, READ the target source files to understand their real imports, class structure, and how to call them. Don't guess — verify. The harness will run inside Docker with the project source at /app.

## Output
Return the complete harness file inside a single fenced code block with the language tag.
After the code block, return a JSON object:
{"startCommand": "ruby harness.rb", "harnessFileName": "harness.rb", "docker": true}

- **startCommand**: the shell command to start the harness server
- **harnessFileName**: the filename to save the harness code as (e.g. harness.rb, harness.js, harness.py)
- **docker**: whether it should run inside Docker

For Docker-based projects where the deps are inside a container, the harness should also run inside that container. For native projects, run directly.`,
    },
    {
      role: "user",
      content:
        "Read the source files for each target function to understand their imports, dependencies, and how to instantiate/call them with MINIMAL bootstrapping. Avoid full framework boot if at all possible. Generate the harness server.",
    },
  ];
}

// ---------------------------------------------------------------------------
// Prompt 3: Identify minimal infrastructure from compose files
// ---------------------------------------------------------------------------

export function identifyInfraPrompt(
  techStack: string,
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `You are a DevOps engineer. Given a ${techStack} project, identify the MINIMAL infrastructure services (databases, caches) needed to run backend logic — NOT the web server itself.

## What to look for
1. Docker Compose files (compose.yml, docker-compose.yml, etc.) — find database and cache services
2. Database config files (database.yml, .env, config/database.py, knexfile, etc.) — find connection strings
3. README — setup instructions for databases

## What to extract
For each required service:
- Service name from compose file
- Docker image and tag used
- Port mapping
- Environment variables needed
- Volume mounts (if any)

## Output format
Return a JSON object:
{
  "composeFile": "docker-compose.yml" | null,
  "services": [
    {
      "name": "postgres",
      "image": "postgres:15",
      "ports": ["5432:5432"],
      "env": {"POSTGRES_PASSWORD": "dev", "POSTGRES_DB": "myapp_dev"},
      "essential": true
    }
  ],
  "migrationCommand": "bundle exec rails db:create db:migrate" | "npm run migration:up" | null,
  "envVars": {"DATABASE_URL": "postgres://..."}
}

## Rules
- Only include data stores (PostgreSQL, MySQL, MongoDB, Redis, Elasticsearch, etc.)
- Do NOT include web servers, reverse proxies, frontend dev servers, or the app itself
- Mark services as essential=true if they're needed for basic DB operations, essential=false if optional (e.g. Elasticsearch for search features)
- If a compose service uses \`build:\` instead of \`image:\`, identify the underlying database software and use the standard Docker Hub image (e.g. postgres:16, redis:7-alpine, mysql:8)
- Always include port mappings. If the compose file doesn't map ports, use the standard default ports (e.g. 5432:5432 for PostgreSQL, 6379:6379 for Redis, 3306:3306 for MySQL)
- If no compose file exists but database config references a service, note it
- Prefer extracting from existing compose files rather than guessing`,
    },
    {
      role: "user",
      content:
        "Analyze this project's infrastructure requirements. Read compose files, database configs, and environment files. Return the minimal infrastructure needed for running backend logic.",
    },
  ];
}

// ---------------------------------------------------------------------------
// Prompt 5: Repair Dockerfile.harness after build or runtime failure
// ---------------------------------------------------------------------------

export function harnessDockerfileRepairPrompt(
  error: string,
  currentDockerfile: string,
  harnessCode: string,
  harnessFileName: string,
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `You are a DevOps engineer. A harness server (\`${harnessFileName}\`) failed to build inside Docker. Diagnose the error and fix the Dockerfile.

The error may be a missing gem/package, wrong environment variable, missing source files, or permission issue. Read the harness code and project files to understand what's needed.

IMPORTANT: If the error is a **database connection issue** (connection refused, no password supplied) or a **harness code bug** (NameError, NoMethodError, SyntaxError in the harness file), return the current Dockerfile unchanged — those are handled separately.

Use your tools to read project files as needed, then return the complete fixed Dockerfile inside a fenced code block.`,
    },
    {
      role: "user",
      content: `The harness failed with:\n\`\`\`\n${error}\n\`\`\`\n\nCurrent Dockerfile:\n\`\`\`dockerfile\n${currentDockerfile}\n\`\`\`\n\nHarness code:\n\`\`\`\n${harnessCode}\n\`\`\`\n\nRead project files as needed, then return the fixed Dockerfile.`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Prompt 6: Self-contained Dockerfile for tier 1/2 targets (no full app build)
// ---------------------------------------------------------------------------

export function standaloneHarnessDockerfilePrompt(
  techStack: string,
  harnessCode: string,
  harnessFileName: string,
  startCommand: string,
  port: number,
  targets: Array<{ file: string; className: string; name: string; deps: string[]; tier?: number; requireStatements?: string[] }>,
): ChatCompletionMessageParam[] {
  const targetSummary = targets
    .map((t) => `- ${t.className}.${t.name} (${t.file}) — deps: ${t.deps.join(",")} — tier: ${t.tier ?? "?"}`)
    .join("\n");
  const allFiles = [...new Set(targets.map((t) => t.file))];

  return [
    {
      role: "system",
      content: `You are a DevOps engineer. Create a **self-contained** Dockerfile for a security-scanning harness.

## Approach
The harness targets low-level service/utility functions that do NOT need the full application framework. Instead of building the entire app, create a lightweight image with:
1. A stock runtime image (e.g. \`ruby:3.4\`, \`node:20\`, \`python:3.12\`)
2. ONLY the specific source files the harness needs
3. ONLY the minimal dependencies those files require

## Tech stack: ${techStack}

## Target functions
${targetSummary}

## Files the harness code imports/requires
${allFiles.map((f) => `- ${f}`).join("\n")}

## Harness file: ${harnessFileName}
## Start command: ${startCommand}
## Port: ${port}

## What to do
1. Start FROM a stock runtime image (small — use slim/alpine variants if available)
2. Read the harness code and target files to understand their \`require\`/\`import\` statements
3. Install only the gems/packages the harness and target files actually need (sinatra, pg, activerecord, etc.)
4. \`COPY . /app\` — copy the full project source to preserve all transitive require chains. This is safe because we don't run \`bundle install\` or build assets.
5. COPY the harness file into the image
6. DO NOT run \`bundle install\`, \`npm install\`, or build frontend assets
7. For Ruby: set \`ENV RUBYLIB=/app/lib\` so bare \`require 'filename'\` finds project files in lib/

## For Ruby targets specifically:
- **Set \`ENV BUNDLE_GEMFILE=""\`** to prevent Bundler from interfering
- **Set \`ENV RUBYLIB=/app/lib\`** so bare \`require 'some_file'\` finds project files in lib/
- Use \`gem install sinatra activesupport\` (+ other needed gems) directly — NOT Bundler with the project's Gemfile
- If targets need ActiveRecord/ActiveSupport, install those gems directly too
- **Always \`COPY . /app\`** — tracing individual file dependencies is fragile; just copy the whole project source. The image stays small because we don't run \`bundle install\` or build assets.
- Set WORKDIR /app

## Important
- The image stays small because we skip \`bundle install\`/\`npm install\`/asset compilation — just source files + a few gems
- For Ruby: always set both \`ENV BUNDLE_GEMFILE=""\` and \`ENV RUBYLIB=/app/lib\`
- If a target file requires Rails-internal modules, install just the specific gem (e.g. \`gem install activerecord activesupport\`)

Return ONLY the complete Dockerfile inside a fenced code block.`,
    },
    {
      role: "user",
      content: `Here is the harness code:\n\n\`\`\`\n${harnessCode}\n\`\`\`\n\nRead the target files to trace all required files and dependencies, then generate a minimal self-contained Dockerfile.`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Prompt 7: Repair harness code after endpoint probe failures
// ---------------------------------------------------------------------------

export function harnessCodeRepairPrompt(
  harnessCode: string,
  harnessFileName: string,
  endpointErrors: Array<{ method: string; path: string; status: number; body: string }>,
  targets: Array<{ name: string; className: string; file: string; params: Array<{ name: string; type: string; sample: string }>; deps: string[]; tier?: number; requireStatements?: string[] }>,
): ChatCompletionMessageParam[] {
  const errorSummary = endpointErrors
    .map((e) => `${e.method} ${e.path} → ${e.status}\n  ${e.body}`)
    .join("\n\n");

  const targetSummary = targets
    .map((t) => `- ${t.className}.${t.name} (${t.file}) — deps: ${t.deps.join(",")} — tier: ${t.tier ?? "?"}`)
    .join("\n");

  return [
    {
      role: "system",
      content: `You are a security engineer fixing a harness server. The harness wraps backend functions for DAST scanning.

## Harness file: ${harnessFileName}

## Target functions
${targetSummary}

## Errors encountered
${errorSummary}

## Your task
Diagnose the root cause of each error by reading the target source files and their dependencies. Fix the harness code.

Key principles:
- Read the actual source files to understand what each target needs
- If a dependency is a framework module not needed for the core computation (logging, events, metrics), stub it minimally
- If a require path is wrong, find the correct one by reading the project structure
- Do NOT remove endpoints — fix them
- The harness runs in Docker at /app with the full project source available

Return the complete fixed harness file inside a single fenced code block with the language tag.`,
    },
    {
      role: "user",
      content: `Current harness code:\n\n\`\`\`\n${harnessCode}\n\`\`\`\n\nRead the source files for the failing targets. Diagnose the root cause of each error and fix the harness code. Return the complete fixed harness file.`,
    },
  ];
}
