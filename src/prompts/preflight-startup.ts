import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

/**
 * Prompt for the pre-flight startup validation step.
 * Runs ONCE after Dockerfile + compose.yml are generated but BEFORE the first
 * `docker compose build`. Reviews both files as a unit and catches issues that
 * would otherwise surface one-per-attempt across multiple slow Docker builds.
 */
export function preflightStartupPrompt(
  dockerfile: string,
  dockerfileName: string,
  composeContent: string | undefined,
  discoveryNotes: string[],
  techStack: string,
): ChatCompletionMessageParam[] {
  const composeSection = composeContent
    ? `\n\n## compose.yml\n\`\`\`yaml\n${composeContent}\n\`\`\``
    : "\n\n(No compose.yml — standalone Docker build)";

  const notesSection = discoveryNotes.length > 0
    ? `\n\n## Discovery notes (from earlier analysis)\n${discoveryNotes.map(n => `- ${n}`).join("\n")}`
    : "";

  return [
    {
      role: "system",
      content: `You are a Docker build expert doing a final review of a Dockerfile and compose.yml BEFORE the first build attempt. Your job is to catch problems that would cause build failures or runtime crashes, saving expensive Docker build cycles.

Tech stack: ${techStack}

## What you're reviewing

### ${dockerfileName}
\`\`\`dockerfile
${dockerfile}
\`\`\`${composeSection}${notesSection}

## What to check

Review these files as a unit and look for issues in these categories:

1. **Missing system packages** — Does the app need runtime tools (ImageMagick, brotli, ffmpeg, wkhtmltopdf, etc.) that aren't installed? Check the codebase for shell-outs and binary dependencies.
2. **Wrong app server / CMD** — Does the CMD/entrypoint match the actual server the app uses? Check Gemfile/Procfile/package.json for the real server binary (pitchfork vs puma vs unicorn, gunicorn vs uvicorn, etc.).
3. **Database extension dependencies** — Search for \`CREATE EXTENSION\` in migration files. If the app needs extensions like pgvector, hstore, postgis, etc., verify the DB image includes them (e.g. postgres:16 does NOT include pgvector — need pgvector/pgvector:pg16 or similar).
4. **Package manager issues** — Is the lockfile copied before install? Is corepack/pnpm/yarn set up correctly? Are build-time vs runtime deps separated properly?
5. **Asset compilation** — Does the build need DB/Redis access during asset precompile? If so, is there a skip flag (SKIP_DB_AND_REDIS=1, DATABASE_URL=nulldb, etc.)? Does it need network access or hostnames?
6. **Plugin/extension compatibility** — Does the app have plugins that require packages not in the base image? Check plugin directories and their dependencies.
7. **Environment variables** — Are required env vars set in compose? Does the app need specific vars to boot (SECRET_KEY_BASE, DATABASE_URL, etc.)?
8. **Port mapping** — Does compose expose the right port? Does the app actually listen on the port specified?
9. **Bundle/dependency groups** — Are required runtime gems/packages excluded by BUNDLE_WITHOUT or similar? (e.g. if puma is in the :test group and you exclude test, puma won't be available)

## Tools available
- **read_file / search_files / list_files** — Inspect the application codebase (Gemfile, package.json, migration files, Procfile, etc.)
- **search_web** — Search the internet to verify image capabilities (e.g. "does postgres:16 include pgvector extension?")
- **verify_docker_image** — Check if a Docker image:tag exists on Docker Hub

## Output format

After your review, respond with ONLY this JSON (no markdown fencing):
{
  "issues": [
    {
      "severity": "critical" | "warning",
      "description": "what's wrong",
      "file": "Dockerfile.bright" | "compose.yml",
      "fix": {
        "old_string": "exact string to find in the file",
        "new_string": "replacement string"
      }
    }
  ],
  "summary": "one-line summary of what was found"
}

Rules:
- Only report issues you're confident about — don't guess.
- Use search_web to verify when unsure (e.g. whether an image includes a package).
- Each fix must use exact find-and-replace strings that match the file content.
- "critical" = will definitely cause build failure or runtime crash. "warning" = might cause issues.
- If everything looks good: {"issues": [], "summary": "No issues found"}
- Focus on problems that would cause the FIRST build/startup to fail. Don't optimize.`,
    },
    {
      role: "user",
      content: "Review these build files and report any issues that would cause the Docker build or application startup to fail. Use the tools to check the codebase for dependencies, migration files, and runtime requirements.",
    },
  ];
}
