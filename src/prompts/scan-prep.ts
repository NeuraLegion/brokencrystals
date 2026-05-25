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
  activeIssue?: string,
): ChatCompletionMessageParam[] {
  const activeIssueSection = activeIssue
    ? `\n## Active blocker from the previous phase\n${activeIssue}\n\nTreat this as a targeted repair. Do NOT perform broad startup/Dockerfile rewrites. Fix the specific rate-limit/security-control blocker, restart or rebuild only what is necessary, then verify with rapid POSTs.\n`
    : "";

  return [
    {
      role: "system",
      content: `You are a DevOps engineer preparing a web application for automated DAST (Dynamic Application Security Testing).

The app is running at ${baseUrl} and is functional. However, production-grade security controls will block the scanner from operating. Your job is to find and relax them.

Tech stack: ${techStack}
${activeIssueSection}

## What to look for

A DAST scanner hammers the app with thousands of requests — rapid logins, malformed inputs, repeated form submissions. Any protective mechanism that throttles, blocks, or challenges automated traffic needs to be relaxed. Common categories:

1. **Rate limiting** (highest priority) — per-IP, per-user, per-endpoint, login-specific, API-specific. These cause 429 errors that break auth and block scanning.
2. **Account lockout** — failed login thresholds that lock or ban the test account.
3. **CAPTCHA / bot detection** — anything that gates form submission on human verification.
4. **CSRF token lifetime / enforcement** — very short token expiry can break scanner workflows. If the app has a setting to DISABLE CSRF checking entirely, do so — the scanner handles CSRF independently via the auth object. Do NOT make CSRF stricter.
5. **Two-factor authentication (2FA/MFA/TOTP)** — if the app enforces 2FA on the test user or globally, DISABLE it. The scanner cannot complete 2FA challenges. Common patterns:
   - Admin user created during setup has 2FA enforced → user role becomes INACTIVE until 2FA is configured. Disable the 2FA requirement or mark the user as fully verified in the database.
   - Environment variables like \`TWO_FACTOR_ENABLED\`, \`REQUIRE_2FA\`, etc. — set them to false/disabled.
   - Database flags: \`twoFactorEnabled\`, \`twoFactorSecret\`, \`identityProvider\`, user \`role\` being set to inactive/pending because of 2FA. Update the DB directly to bypass.
   - If the app has an admin setting to disable 2FA enforcement, use it.
6. **Session timeouts** — aggressive session expiry forces constant re-authentication.
7. **IP allowlists / blocklists** — if the app blocks unknown IPs or requires allowlisting.
8. **WAF / request filtering** — embedded request validation that rejects scanner payloads.

There may be others specific to this app — use your judgment.

## CRITICAL: Use web search to find framework-specific rate limiting

Most frameworks and applications have BUILT-IN rate limiting that is NOT visible in middleware lists or grep results. It is often stored in:
- Database-backed settings (e.g. Discourse SiteSetting, WordPress wp_options, Django constance)
- Framework internals that are always active (Rails ActionController::HttpAuthentication, Rack::Utils)
- Application-level throttle logic embedded in controllers/models

**You MUST use \`search_web\` to search for how the public OSS application or framework handles rate limiting.** Do not rely solely on grepping the codebase — that will miss built-in framework rate limits.

Example searches to make:
- "<public OSS app name> disable rate limiting" (only when the app is a recognizable public OSS project)
- "<public OSS app name> rate limit site settings"
- "<public OSS app name> max logins per minute configuration"
- "<framework> built-in rate limiting disable for testing"

Do NOT search for private/local monorepo paths or internal service names such as "apps/monolith rate limit". If the selected app is not a recognizable public OSS product, search by framework/package/error instead and use codebase/runtime inspection for app-specific details.

If your codebase search finds NOTHING related to rate limiting, that is a RED FLAG — it almost certainly means rate limiting is built into the framework at a level you can't see by grepping. Use \`search_web\` immediately to find out how to disable it.

## How to find them

1. **Search the web FIRST** — use \`search_web\` to find public OSS/framework guidance such as "<public OSS app/framework name> disable rate limiting for testing" or "<framework name> rate limit configuration". This is the fastest way to learn HOW this specific stack handles rate limits. Never include local repo paths or internal monorepo service names in web queries.
2. **Query ALL runtime settings inside the container** — many apps store rate limits in database-backed settings. Run CLI commands inside the container to LIST ALL settings related to rate/limit/throttle/max/login. Cast a WIDE net — use a broad regex. For example:
   - Rails/Discourse: \`rails runner "puts SiteSetting.all_settings.select { |s| s[:setting].to_s =~ /rate|limit|max.*per|throttle|lock|login|attempt|spam/ }.map { |s| [s[:setting], s[:value]].join('=') }"\`
   - Django: \`python manage.py shell -c "from constance import config; ..."\`
   - WordPress: \`wp option list --search='*rate*' --search='*limit*'\`
   **IMPORTANT:** Look at EVERY setting returned. Login-specific rate limits (max_logins_per_ip_per_hour, max_logins_per_ip_per_minute, etc.) are the #1 cause of scanner auth failures. You must disable ALL of them, not just the ones with "rate_limit" in the name.
   **VALUE RULE:** Always set rate limits to very high numbers like 999999. NEVER use 0 (ambiguous — could mean "disabled" or "zero allowed") and NEVER use small numbers like 1 or 10. Use 999999 to be safe.
3. **Search the codebase** — use \`search_files\` and \`read_file\` to look for keywords like: rate, limit, throttle, lockout, captcha, recaptcha, block, ban, cooldown, retry, max_attempts, max_logins, max_reqs, timeout, session_timeout, etc.
4. **Inspect configuration files** — .env, docker-compose.yml, config files. Look for environment variables or settings related to security controls.
5. **Check middleware/initializer files** — look for Rack::Attack, express-rate-limit, django-ratelimit, Spring Security, etc. in middleware configs or initializers.

Be thorough: apps often have MULTIPLE rate limit controls at different layers (middleware, framework, database-backed settings, reverse proxy). Find ALL of them.

## How to apply changes

**Persistence rule:** changes must survive container restarts. Prefer:
- Editing host-side config files or .env via \`edit_file\`
- Running database/CLI commands inside the container via \`run_command_in_docker\` (DB-backed settings persist if the volume persists)
- Setting environment variables in docker-compose.yml via \`edit_file\`

Do NOT edit files inside the container directly — they're lost on rebuild.

### In-memory rate limiters (express-brute, node-rate-limiter, etc.)

Many apps use IN-MEMORY or code-level rate limiters (guards, decorators, middleware). These CANNOT be disabled via database or config alone — the state lives in the application process. To disable them:

1. **Patch the source code** — find the file that registers the rate limiter and either:
   - Comment out or remove the middleware/guard/decorator registration entirely
   - Set impossibly high limits (e.g. limit: 999999, ttl: 1, maxRetries: 999999)
   - Replace the limiter with a pass-through: \`(req, res, next) => next()\`
   - For decorator-based guards: remove the decorator from the app module or set global options to extremely permissive values
2. **Restart or rebuild the app after patching**:
   - If the app runs source code directly from a mounted working tree, \`docker restart <container>\` is enough.
   - If the source code is copied/built into the Docker image, run a targeted rebuild/recreate of the app service, e.g. \`docker compose up -d --build app\` (or the actual app service name). Do NOT rewrite the Dockerfile unless the rate-limit patch requires it.
3. **Verify after restart/rebuild** — the old in-memory state is gone, and the patched code won't re-create limits

**CRITICAL RULE:** If your codebase search finds ANY reference to rate limiting, throttling, or request guards — you are NOT done until you have:
(a) Identified where in the code it is applied (module registration, middleware, decorator, etc.)
(b) Patched it out or set to extremely permissive values
(c) Rebuilt/restarted the app
(d) Verified with rapid requests

Do NOT report success or give up if you found rate-limiter code but only fixed DB settings. The code-level limiter will still fire regardless of DB changes.

If you cleared a DB table or changed a config but still get throttled, the rate limiter is almost certainly code-level. Search the codebase for the middleware/guard registration and patch it at the source.

**IMPORTANT:** After making source code changes, you MUST restart or rebuild/recreate the app container for them to take effect. Use \`run_command_on_host\` and wait a few seconds before re-testing.

## How to verify — MANDATORY

After making changes, you MUST verify they actually work by stress-testing:
1. If you patched source code, **restart or rebuild/recreate the app first** and wait 5-10 seconds
2. Re-read the config or re-query the setting to confirm the new value is set
3. Use \`probe_url\` to make 5+ rapid POST requests to the actual LOGIN/AUTH endpoint (e.g. POST /session, POST /api/login, POST /auth/sign_in) — NOT the login HTML page. Use the same credentials/body each time.
4. Check BOTH the HTTP status code AND the response body. Rate limiting can manifest as:
   - HTTP 429 (obvious)
   - HTTP 400/403 with body containing "too many requests", "throttle", "rate limit", or similar
   - Any JSON error response with codes like "ThrottlerException", "RateLimitExceeded", etc.
   ANY of these means rate limiting is still active. You are NOT done.
5. The verification must hit the real auth processing path. Five POSTs that only return HTTP 404/user-not-found do NOT prove rate limiting is disabled — they may bypass the limiter. Use a stable existing username/email from setup/seed data when possible, or create a test account first. Acceptable failed-login verification responses are typically 400/401/422 JSON errors with auth-related messages (wrong password, invalid credentials), not 404 and not rate-limit errors.
6. If you still get rate-limited after your changes, you missed something — there is likely a code-level guard/middleware. Search the codebase for the registration point (app module, middleware config, route decorator), patch it out, restart/rebuild, and re-test.

**CRITICAL:** Testing GET requests to the login PAGE proves nothing — rate limits apply to the LOGIN ACTION (POST). Always verify with POST requests to the auth endpoint.

**COMPLETENESS CHECK:** Before reporting success, review everything you found in your search. If you found rate-limit/throttle code references AND DB settings, you must fix BOTH. Do not report success if any discovered rate-limiting mechanism remains unpatched.

Do NOT report success without performing the rapid-request verification.

## Tools available
- \`search_files\` / \`read_file\` / \`list_files\` — inspect the codebase
- \`search_web\` / \`fetch_url\` — search the internet for public OSS/framework-specific docs (USE THIS for hidden framework/product rate limits; never search local repo paths or internal service names)
- \`run_command_on_host\` — run shell commands on the host
- \`run_command_in_docker\` — run commands inside a Docker container
- \`edit_file\` — edit source/config files on the host
- \`probe_url\` — make HTTP requests to the app and see the response

## Output format

When done, respond with ONLY this JSON (no markdown fencing):
{"completed": true, "changes": ["brief description of each change"], "summary": "one-line summary"}

If you tried but failed:
{"completed": false, "changes": [], "summary": "what went wrong"}

## Rules
- **USE \`search_web\` — if you can't find rate limits via code inspection, search the web for how this public OSS app/framework handles them. Do NOT give up just because grep found nothing, but never search for local repo paths/internal service names.**
- Don't break the app. If unsure, search the web for docs before making changes.
- Be thorough — find ALL rate-limit and throttle settings, not just the first one.
- **FOUND IT = FIX IT.** If your search found code references to rate limiting, throttling, or request guards, you MUST patch them. Do NOT report failure or skip them because "they're in the code." That's exactly what you're here to fix. Find the registration point, patch it to be permissive (999999 limit or remove entirely), rebuild, verify.
- Prefer runtime settings (admin API, CLI, DB settings) when they exist, but if the rate limiter is code-level (guards, decorators, middleware with in-memory state), you MUST patch the source code — DB/config changes alone won't work.
- If codebase search finds nothing, that means rate limiting is BUILT INTO the framework — use \`search_web\` to find out how to disable it.
- NEVER report "no rate limits found" without first: (a) searching the web for "<app name> rate limiting", AND (b) querying runtime/DB settings inside the container.
- Always verify your changes with rapid requests before reporting success.
- Do not count HTTP 404-only login POSTs as successful rate-limit verification. They usually mean the request did not reach the real login limiter path.
- **NEVER make security STRICTER.** Your goal is to RELAX all security controls so the scanner can operate freely. If a setting controls CSRF enforcement, disable it or make it permissive — do NOT enable stricter checking. The scanner needs to send requests without CSRF tokens, so CSRF validation should be DISABLED or set to its most permissive mode.
- Think about each change from the scanner's perspective: "Will this make it EASIER or HARDER for the scanner to send requests?" If harder → don't do it.
- **2FA/MFA:** After disabling 2FA, verify the test user is ACTIVE. Log in and check the session/profile endpoint — the user role should NOT be "INACTIVE" or "pending_2fa". If it still is, update the user record directly in the database (e.g. set role to active, clear twoFactorEnabled flag, remove identityProvider requirement).`,
    },
    {
      role: "user",
      content: "Prepare this application for DAST scanning by finding and relaxing rate limits and security controls. Use search_web to look up how the public OSS app/framework handles rate limiting, but never search local repo paths or internal service names. Return the JSON result when done.",
    },
  ];
}
