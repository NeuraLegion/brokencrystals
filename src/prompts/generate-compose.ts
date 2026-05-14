import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";
import type { ProjectDiscovery } from "../types.js";

/**
 * Prompt for LLM-based Docker Compose file generation.
 * Uses the structured output from the project discovery phase.
 */
export function generateComposePrompt(
  techStack: string,
  discovery: ProjectDiscovery,
  hasDockerfile: boolean,
  hints?: string[],
  dockerfileName?: string,
): ChatCompletionMessageParam[] {
  const discoveryJson = JSON.stringify(discovery, null, 2);

  const hintsSection = hints && hints.length > 0
    ? `\n## Hints from previous attempts\nThese were discovered through investigation — use them:\n${hints.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n`
    : "";

  return [
    {
      role: "system",
      content: `You are a DevOps engineer. Generate a Docker Compose file for a ${techStack} project based on the infrastructure discovery below.

## Project Discovery
${discoveryJson}
${hintsSection}
## Requirements

Generate a complete \`compose.yml\` (v3+ syntax, no "version:" key needed) that includes:

1. **App service**:
   - ${hasDockerfile
      ? dockerfileName && dockerfileName !== "Dockerfile"
        ? `\`build:\\n  context: .\\n  dockerfile: ${dockerfileName}\` (non-standard Dockerfile name — you MUST use the extended build syntax)`
        : '`build: .` (Dockerfile already exists)'
      : '`build: .` (a Dockerfile will be generated separately)'}
   - Maps port ${discovery.port}
   - Sets all environment variables from appEnvironment
   - Depends on all other services with \`condition: service_healthy\` (or \`service_started\` if no healthcheck)
   - Sets \`stdin_open: true\` and \`tty: true\` for container stability

2. **Companion services** (from discovery):
   - Use the exact images specified in the discovery
   - Set environment variables as specified
   - Add health checks for databases and caches:
     - PostgreSQL: \`pg_isready -U <user>\`
     - MySQL: \`mysqladmin ping -h localhost\`
     - Redis: \`redis-cli ping\`
     - MongoDB: \`mongosh --eval "db.adminCommand('ping')"\`
     - Elasticsearch: \`curl -f http://localhost:9200/_cluster/health\`
   - Use named volumes for data persistence (e.g. \`db-data:/var/lib/postgresql/data\`)

3. **Config patching** (from configNotes):
   - If config files need modification for Docker networking, add the necessary environment variables or volume mounts
   - Prefer environment variables over file modifications when the framework supports it

4. **Networking**:
   - All services share the default compose network — they reference each other by service name (e.g. app connects to "db" on port 5432)

5. **Healthcheck & restart policy for the app service**:
   - Many apps run database migrations on first boot — this can take 30-120 seconds
   - Use a generous \`start_period\` (at least 120s) so Docker doesn't restart the container mid-migration
   - Use \`restart: on-failure\` (NOT \`restart: always\`) — if the app crashes during migration, "always" can spawn a second instance that hits a migration lock
   - If the framework has a separate migration command (e.g. \`rails db:migrate\`, \`knex migrate:latest\`, \`npx prisma migrate\`), run it in the entrypoint BEFORE starting the app server, using a lock or single-execution guard

6. **DAST scope control**:
   - Keep compose minimal: include the selected web/API app service plus required dependency services only.
   - Do NOT include unrelated workers, CLI utilities, browser extensions, demo apps, optional observability/exporter services, or every service in a monorepo unless the target HTTP app cannot boot without them.
   - If existing repo compose files build many unrelated local services, generate a smaller compose for this scan instead of copying the broad stack.

## Output

Return ONLY the compose.yml content inside a single fenced code block (\`\`\`yaml ... \`\`\`). No explanation outside the code block.`,
    },
    {
      role: "user",
      content: `Generate the Docker Compose file based on the discovery data. Use the tools to verify any details if needed.`,
    },
  ];
}
