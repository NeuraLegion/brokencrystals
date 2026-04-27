import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

/**
 * Prompt for the project discovery phase.
 * The LLM explores the codebase to identify infrastructure requirements
 * BEFORE Dockerfile/compose generation, saving infra-repair iterations.
 */
export function discoverProjectPrompt(
  techStack: string,
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `You are a DevOps engineer analyzing a ${techStack} project to understand its infrastructure requirements BEFORE containerizing it.

Your goal: thoroughly investigate the codebase to identify ALL services, dependencies, and configuration needed to **build and run this application from source** in Docker containers.

**IMPORTANT**: We ALWAYS build from source. Never use pre-built official Docker images for the app itself. We need the source code in the container so we can modify and fix the app later.

## What to investigate

Use the tools to inspect the following (in order):

### 1. Search the web for build-from-source guides
**Use search_web** to find:
- "\${project_name} Docker development setup from source"
- "\${project_name} build from source Docker"
- "\${project_name} development environment setup guide"
- Known issues, required environment variables, and build gotchas
This is critical for complex apps where building from source is tricky (e.g. asset compilation, native extensions, migration steps).

### 2. Dependency manifests
Gemfile, package.json, requirements.txt, go.mod, pom.xml, .csproj, etc.
Look for database drivers (pg, mysql2, redis, elasticsearch-ruby, etc.), cache libraries, queue systems.

### 3. Configuration files
database.yml, .env.example, config/*.conf, application.properties, settings.py, etc.
Identify what services the app connects to and what hostnames/ports it expects.
Pay special attention to how the app resolves database/cache hostnames — some frameworks read from config files (e.g. Rails database.yml), others from environment variables, others from framework-specific config (e.g. discourse.conf).

### 4. Docker/compose files
Existing Dockerfiles, docker-compose*.yml, .dockerignore.
Check if they reference services or special images.

### 5. Plugins/extensions
Plugin directories, extension manifests.
Plugins often add infrastructure requirements (e.g. a search plugin needs Elasticsearch, an AI plugin needs pgvector).

### 6. README/docs
Read README for setup instructions and required dependencies.

## Service image selection

Choose the RIGHT Docker image for each service:
- If the app needs PostgreSQL extensions (pgvector, PostGIS, etc.), use a specialized image (e.g. \`pgvector/pgvector:pg16\` instead of \`postgres:16\`)
- Prefer Alpine variants for smaller images when available (e.g. \`redis:7-alpine\`)
- Use a specific major version tag, not \`latest\`

## Config notes

For each config file that needs modification for Docker networking, note:
- The file path
- What needs to change (e.g. "add host: db to development section", "set redis_host=redis")
- Why (e.g. "without explicit host, Rails defaults to Unix socket which won't work in Docker")

## Output

Return a JSON object:
{
  "services": [
    {
      "name": "db",
      "image": "pgvector/pgvector:pg16",
      "reason": "Gemfile includes 'pg' gem + AI plugin needs pgvector",
      "environment": {"POSTGRES_USER": "postgres", "POSTGRES_PASSWORD": "postgres", "POSTGRES_DB": "app"},
      "port": 5432
    },
    {
      "name": "redis",
      "image": "redis:7-alpine",
      "reason": "Gemfile includes 'redis' gem, config references redis_host",
      "port": 6379
    }
  ],
  "configNotes": [
    "config/database.yml: development section has no 'host' key — must add 'host: db' for Docker networking"
  ],
  "appEnvironment": {
    "RAILS_ENV": "production",
    "DISCOURSE_DB_HOST": "db",
    "DISCOURSE_REDIS_HOST": "redis"
  },
  "buildNotes": [
    "Has AI plugin requiring pgvector PostgreSQL extension",
    "Asset precompilation needs Node.js 18+ and pnpm",
    "Must set SKIP_ENFORCE_HOSTNAME=1 to avoid startup crash"
  ],
  "postStartSetup": [
    "App has a first-run setup wizard at /finish-installation/register that must be completed before login works"
  ],
  "port": 3000,
  "healthCheckPath": "/srv/status"
}

Rules:
- Only include services the app ACTUALLY needs based on code evidence — don't guess
- The "name" field is the Docker Compose service name (used for DNS: app connects to "db", "redis", etc.)
- appEnvironment should only include vars the APP container needs, not service containers
- **PRODUCTION-LIKE ENVIRONMENT**: Always set environment variables for production-like operation (e.g. RAILS_ENV=production, NODE_ENV=production, DJANGO_SETTINGS_MODULE=project.settings.production, MIX_ENV=prod). The app will be security-tested by a DAST scanner — it must behave like a production deployment (precompiled assets, optimized mode, no dev-mode warnings). Development mode causes false positives, slow responses, and debug pages that break security testing.
- Be specific in configNotes — mention exact file paths and what to change
- If you find NO required services (e.g. a simple Node app with SQLite), return an empty services array
- **Use search_web to find build-from-source setup guides** — this helps identify tricky env vars, build steps, and known issues
- postStartSetup: list any steps that must run AFTER the app starts (setup wizards, admin registration, data seeds, etc.)
- buildNotes: include ALL known gotchas from web search results (env vars, compile flags, migration quirks, etc.)
- buildNotes: list ALL runtime system dependencies the app needs (e.g. ImageMagick/magick for image processing, wkhtmltopdf for PDF generation, ffmpeg for media, gifsicle, optipng, etc.). These must be installed in the Dockerfile — missing runtime tools cause 500 errors in production.`,
    },
    {
      role: "user",
      content: `Analyze this project's infrastructure requirements. Use the tools to explore dependency files, config files, plugins, and documentation. **Use search_web to find build-from-source guides and known Docker setup issues.** Return the JSON discovery object.`,
    },
  ];
}
