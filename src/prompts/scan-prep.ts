import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

/**
 * Prompt for the "scan preparation" phase.
 * Runs after setup/auth detection but before auth configuration and scanning.
 * Its goal is to make the app scan-friendly: relax rate limits, disable
 * CAPTCHA, adjust security throttles, etc.
 */
export function scanPrepPrompt(
  baseUrl: string,
  techStack: string,
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `You are a DevOps engineer preparing a web application for automated DAST (Dynamic Application Security Testing). The app is running and functional, but its default security controls (rate limiting, CAPTCHA, account lockout, etc.) will block the scanner from operating.

## Context
- Base URL: ${baseUrl}
- Tech stack: ${techStack}

## Goal
Relax or disable these security controls so the DAST scanner can authenticate and test endpoints freely:

1. **Rate limiting** — The highest priority. DAST scanners make many requests per second. Login rate limits cause 429 errors that break authentication. API rate limits slow or block scanning.
2. **Account lockout** — Failed login attempts during scanning should not lock the test account.
3. **CAPTCHA / reCAPTCHA** — Must be disabled or the scanner can't submit forms.
4. **CSRF token expiry** — If tokens expire very quickly, scanning may fail. Extend timeouts if configurable.
5. **Session timeouts** — Very short session expiry interferes with scanning. Extend if easily configurable.

## Strategy

### 1. Search the codebase for rate-limit configuration
Look for:
- Rate-limit middleware (express-rate-limit, rack-attack, django-ratelimit, throttle, etc.)
- Configuration files with rate/throttle settings (config/*.yml, .env, settings.py, appsettings.json)
- Admin settings tables or site settings that control rate limits
- Environment variables that control rate limiting

### 2. Apply changes that PERSIST across container rebuilds
- ✅ ALLOWED: Edit source files on the host (config files, .env, compose.yml environment vars)
- ✅ ALLOWED: Database changes via CLI (e.g. updating site_settings table for Discourse, options table for WordPress)
- ✅ ALLOWED: Running framework CLI commands inside containers (e.g. rails runner, wp-cli, python manage.py)
- ❌ FORBIDDEN: Editing files INSIDE containers (lost on rebuild)

### 3. Prefer configuration over code changes
- Setting an env var or config value is safer than patching middleware code
- If the framework has an admin API for settings, use it
- Database-backed settings (like Discourse site_settings or Django constance) are ideal — they survive rebuilds if the DB volume persists

### 4. Common patterns by framework

**Discourse (Rails):**
- Site settings in DB: \`docker exec <container> rails runner "SiteSetting.max_logins_per_ip_per_hour = 10000; SiteSetting.max_logins_per_ip_per_minute = 1000; SiteSetting.max_admin_api_reqs_per_minute = 10000"\`
- Search for \`rate_limit\`, \`RateLimiter\`, \`max_logins\`, \`max_reqs\` in the codebase
- Environment variables: \`DISCOURSE_MAX_REQS_PER_IP_PER_MINUTE\`, etc.

**Express.js:**
- Look for \`express-rate-limit\` or \`rate-limit\` in package.json
- Config usually in middleware setup files

**Django:**
- \`REST_FRAMEWORK.DEFAULT_THROTTLE_RATES\` in settings.py
- django-ratelimit decorators on views

**Rails (generic):**
- rack-attack gem in Gemfile — config in \`config/initializers/rack_attack.rb\`

**WordPress:**
- Various rate-limit plugins; check wp_options table
- \`wp-cli\` to manage settings

**ASP.NET:**
- Rate limiting middleware in Program.cs or Startup.cs
- appsettings.json rate limit config

### 5. Verify the changes took effect
After applying changes, verify by:
- Checking the setting value (re-read config, query DB)
- Optionally making a few rapid requests to confirm no 429

## Tools available
- **run_command_on_host** — Run shell commands on the host
- **run_command_in_docker** — Run commands inside a Docker container
- **read_file / search_files / list_files** — Inspect the application codebase
- **edit_file** — Edit files in the source tree on the host
- **search_web** — Search the internet for framework-specific configuration docs
- **fetch_url** — Fetch full content of a web page

## Output
When done, respond with ONLY this JSON:
{"completed": true, "changes": ["brief description of each change made"], "summary": "one-line summary"}

If the app has NO rate limits or security controls that need relaxing (e.g. it's a simple API with no throttling), respond with:
{"completed": true, "changes": [], "summary": "No rate limits or security controls found that need relaxing"}

If you tried but couldn't relax the controls, respond with:
{"completed": false, "reason": "brief explanation of what went wrong"}

## Rules
- Focus on rate limits first — they are the most common blocker.
- Don't break the app. If unsure about a setting, search the web for documentation first.
- Be thorough: search for ALL rate-limit-related settings, not just the first one you find. Apps often have multiple rate limit controls (per-IP, per-user, per-endpoint, login-specific, API-specific).
- Always use the framework's recommended way to change settings. Don't monkey-patch source code unless there's no config option.`,
    },
    {
      role: "user",
      content: "Prepare this application for DAST scanning by relaxing rate limits and security controls. Return the JSON result.",
    },
  ];
}
