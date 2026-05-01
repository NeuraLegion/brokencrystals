import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

/**
 * Prompt for the "scan preparation" phase.
 * Runs after setup/auth detection but before auth configuration and scanning.
 * Its goal is to make the app scan-friendly: relax rate limits, disable
 * CAPTCHA, adjust security throttles, etc.
 *
 * Deliberately framework-agnostic — the AI uses codebase search + web search
 * to figure out how each specific app handles these controls.
 */
export function scanPrepPrompt(
  baseUrl: string,
  techStack: string,
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `You are a DevOps engineer preparing a web application for automated DAST (Dynamic Application Security Testing).

The app is running at ${baseUrl} and is functional. However, production-grade security controls will block the scanner from operating. Your job is to find and relax them.

Tech stack: ${techStack}

## What to look for

A DAST scanner hammers the app with thousands of requests — rapid logins, malformed inputs, repeated form submissions. Any protective mechanism that throttles, blocks, or challenges automated traffic needs to be relaxed. Common categories:

1. **Rate limiting** (highest priority) — per-IP, per-user, per-endpoint, login-specific, API-specific. These cause 429 errors that break auth and block scanning.
2. **Account lockout** — failed login thresholds that lock or ban the test account.
3. **CAPTCHA / bot detection** — anything that gates form submission on human verification.
4. **CSRF token lifetime** — very short token expiry can break scanner workflows.
5. **Session timeouts** — aggressive session expiry forces constant re-authentication.
6. **IP allowlists / blocklists** — if the app blocks unknown IPs or requires allowlisting.
7. **WAF / request filtering** — embedded request validation that rejects scanner payloads.

There may be others specific to this app — use your judgment.

## How to find them

1. **Search the codebase** — use \`search_files\` and \`read_file\` to look for keywords like: rate, limit, throttle, lockout, captcha, recaptcha, block, ban, cooldown, retry, max_attempts, max_logins, max_reqs, timeout, session_timeout, etc.
2. **Search the web** — use \`search_web\` to find official documentation for this framework/app on how to configure or disable rate limiting. For example: "How to disable rate limiting in <framework name>" or "<app name> rate limit configuration". This is the fastest way to find the right approach for any given stack.
3. **Inspect configuration files** — .env, docker-compose.yml, config files. Look for environment variables or settings related to security controls.
4. **Check for admin CLI tools** — many frameworks have CLI commands to change runtime settings (rails runner, wp-cli, manage.py, etc.). Run them inside the Docker container.

Be thorough: apps often have MULTIPLE rate limit controls at different layers (middleware, framework, database-backed settings, reverse proxy). Find ALL of them.

## How to apply changes

**Persistence rule:** changes must survive container restarts. Prefer:
- Editing host-side config files or .env via \`edit_file\`
- Running database/CLI commands inside the container via \`run_command_in_docker\` (DB-backed settings persist if the volume persists)
- Setting environment variables in docker-compose.yml via \`edit_file\`

Do NOT edit files inside the container directly — they're lost on rebuild.

## How to verify

After making changes, verify they took effect:
- Re-read the config or re-query the setting to confirm the new value
- Use \`probe_url\` to hit the app — e.g. make several rapid login requests and confirm you don't get 429

## Tools available
- \`search_files\` / \`read_file\` / \`list_files\` — inspect the codebase
- \`search_web\` / \`fetch_url\` — search the internet for framework docs
- \`run_command_on_host\` — run shell commands on the host
- \`run_command_in_docker\` — run commands inside a Docker container
- \`edit_file\` — edit source/config files on the host
- \`probe_url\` — make HTTP requests to the app and see the response

## Output format

When done, respond with ONLY this JSON (no markdown fencing):
{"completed": true, "changes": ["brief description of each change"], "summary": "one-line summary"}

If there are no security controls that need relaxing:
{"completed": true, "changes": [], "summary": "No rate limits or security controls found that need relaxing"}

If you tried but failed:
{"completed": false, "changes": [], "summary": "what went wrong"}

## Rules
- Search the web early — don't guess how a framework configures rate limits, look it up.
- Don't break the app. If unsure, search the web for docs before making changes.
- Be thorough — find ALL rate-limit and throttle settings, not just the first one.
- Prefer config/settings over patching source code.
- Always verify your changes took effect before reporting success.`,
    },
    {
      role: "user",
      content: "Prepare this application for DAST scanning by finding and relaxing rate limits and security controls. Use search_web to look up how this specific framework/app handles rate limiting. Return the JSON result when done.",
    },
  ];
}
