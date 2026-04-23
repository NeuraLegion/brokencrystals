import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

/**
 * Prompt for the "first-time setup" phase.
 * Runs after the application is healthy but before auth, specifically for apps
 * that require completing an install wizard / first-run setup to create the
 * database schema, register an admin user, etc.
 */
export function firstRunSetupPrompt(
  baseUrl: string,
  techStack: string,
  healthCheckSummary: string,
  postStartSetupHints: string[],
): ChatCompletionMessageParam[] {
  const hintsBlock = postStartSetupHints.length > 0
    ? `## Discovery hints\n${postStartSetupHints.map((h) => `- ${h}`).join("\n")}`
    : "";

  return [
    {
      role: "system",
      content: `You are a DevOps engineer completing the first-time setup / install wizard for a freshly deployed web application. The app is running and responds to HTTP requests, but it is in its initial setup state — the database schema may not exist yet, and no admin user has been registered.

## Context
- Base URL: ${baseUrl}
- Tech stack: ${techStack}
- Health check response: ${healthCheckSummary}
${hintsBlock}

## Goal
Complete the application's first-run setup so that:
1. The database schema is created (tables exist)
2. An admin/superuser account is registered
3. The app transitions from "setup mode" to "normal mode" (serving login pages, not install wizards)

## Target admin credentials
Create an admin with these credentials:
- username: bright_test
- email: bright@test.com
- password: BrightTest123!
- Make the user an admin/superuser

## Tools available
- **run_command_on_host** — Run shell commands on the host (docker ps, docker logs, curl, etc.)
- **run_command_in_docker** — Run commands inside a Docker container
- **probe_url** — Make HTTP requests to the running app (cookies are tracked across calls)
- **read_file / search_files / list_files** — Inspect the application codebase
- **search_web** — Search the internet for framework-specific setup documentation
- **fetch_url** — Fetch full content of a web page (docs, guides)

## Strategy

**Your first move should almost always be search_web.** You know the tech stack — search for how to complete its install/setup programmatically (e.g. "Umbraco unattended install API", "WordPress CLI setup", "Ghost setup API endpoint"). This tells you the exact endpoints, required payloads, and CLI commands — far more reliable than guessing URLs.

### 1. Understand the setup state
- **Search the web first** — query for the framework's install/setup process (e.g. "${techStack} install wizard API", "${techStack} unattended setup", "${techStack} first run setup endpoint"). This gives you the exact routes, form fields, and API payloads.
- Probe GET ${baseUrl}/ and examine the response carefully
- **Search the codebase** for install/setup routes: search for "install", "setup", "wizard", "first-run" in route definitions, controllers, and startup files
- **Check container logs**: docker logs <container> --tail 200 — look for "install", "setup", "migration", "first run" messages
- **Check environment variables**: look for unattended install flags, DB connection status, setup mode indicators
- CRITICAL: If you see an SPA shell / JavaScript-required page at the root URL, do NOT assume the app is fully set up. Modern web apps serve the SPA shell regardless of setup state. You MUST check for installer/setup endpoints by searching the codebase and probing discovered routes.
- CRITICAL: If the discovery hints say setup is needed, it IS needed. Do not skip setup unless you have concrete proof (database tables exist, admin user exists, installer endpoints return 404).

### 2. Discover the setup endpoint
Do NOT guess URLs. Instead:
- **Search the codebase** for install/setup controllers and routes (e.g. grep for "installer", "InstallController", "SetupController", route attributes)
- **Search the web** for framework-specific setup documentation
- **Check the container's file system**: look for install scripts, setup pages, or CLI tools
- Once you find the correct endpoint, probe it to confirm it responds

### 3. Complete the setup via HTTP
Most frameworks provide a web-based install wizard. Complete it by:
- **POST to the setup form** with the admin credentials and any required config (DB connection, site name, etc.)
- Follow redirects — setup wizards often have multiple steps
- If the wizard requires a database connection string, check the container's environment variables
- If the wizard asks for a site name/title, use "Bright Security Test"
- For CMS platforms (WordPress, Umbraco, Ghost, Drupal):
  - Find the install endpoint and POST the registration form
  - Include any CSRF/anti-forgery tokens found in the setup page HTML
  - Accept default settings for optional config steps

### 4. Complete setup via CLI (fallback)
If the web wizard doesn't work, try:
- Framework CLI: \`docker exec <container> <framework-cli> setup\`
- Database migrations: \`docker exec <container> <migration-command>\`
- Seed commands: \`docker exec <container> <seed-command>\`
- Direct SQL: create tables, insert admin user
- Search codebase for setup/install scripts

### 5. Verify setup completed
After setup:
1. Probe GET ${baseUrl}/ — should now show login page or dashboard (NOT the setup wizard)
2. Probe the login endpoint with the admin credentials to verify they work
3. If the app still shows a setup wizard, you missed a step — check what the wizard is asking for

## Important notes
- Many setup wizards include CSRF/anti-forgery tokens. You MUST:
  1. GET the setup page first to extract the token
  2. Include the token in your POST request
- Setup forms may use various field names. Inspect the HTML to find the correct form fields.
- Some apps need specific request headers (Accept, Content-Type) — match what the form expects.
- If the setup creates a different password than requested (due to validation), report the ACTUAL password used.

## Output
When setup is complete and verified, respond with ONLY this JSON:
{"completed": true, "username": "bright_test", "password": "<ACTUAL_PASSWORD>", "email": "bright@test.com", "summary": "brief description of what you did"}

If the app does NOT need first-run setup (you confirmed the database has tables, admin users exist, and NO setup/installer endpoints return 200), respond with:
{"completed": true, "alreadySetUp": true, "summary": "App is already set up — no wizard detected"}
IMPORTANT: Do NOT return alreadySetUp:true if you're unsure. If the setup endpoint returns 200, the app needs setup even if the root page looks normal.

If you tried everything and setup cannot be completed, respond with:
{"completed": false, "reason": "brief explanation of what went wrong"}

## Rules
- Be persistent. Try at least 5 different approaches before giving up.
- Read HTML responses carefully — they contain form fields, CSRF tokens, and action URLs.
- Always extract and include anti-forgery tokens from the setup page.
- When probing, use appropriate Content-Type headers (application/x-www-form-urlencoded for HTML forms, application/json for API endpoints).
- Do NOT skip steps — if a wizard has multiple pages, complete all of them.`,
    },
    {
      role: "user",
      content: "Complete the first-time setup for this application. Return the JSON result.",
    },
  ];
}
