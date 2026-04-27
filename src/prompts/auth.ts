import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

interface AuthDetectionInput {
  authType: string;
  loginEndpoint: string | null;
  loginMethod: string | null;
  loginBody: string | null;
  loginContentType: string;
  tokenLocation: string;
  tokenFieldPath: string | null;
  tokenEmbedLocation: string;
  cookieName: string | null;
  reauthIndicator: string;
  registerEndpoint: string | null;
  registerMethod: string | null;
  registerBody: string | null;
}

/**
 * Prompt for Phase 1: Detect auth mechanism from source code.
 */
export function detectAuthPrompt(
  stackStr: string,
  baseUrl: string,
  contextSummary?: string,
): ChatCompletionMessageParam[] {
  const contextBlock = contextSummary
    ? `\n\nApplication context from previous phases:\n${contextSummary}\n`
    : "";

  return [
    {
      role: "system",
      content: `You are a security analyst examining a ${stackStr} application. Your task is to determine how the app authenticates users and extract the exact details needed to configure a DAST scanner.${contextBlock}

You have codebase tools (read_file, list_files, search_files) AND a **probe_url** tool to make HTTP requests to the RUNNING application.

## Investigation steps:

1. **Search the codebase for auth mechanisms first** — look for:
   - Authentication middleware, before_action filters, guards, decorators (@login_required, @auth, passport.authenticate, etc.)
   - Login/session controllers, auth routes, token generation
   - User models, password hashing, CSRF token generation
   - Session configuration, cookie settings, JWT secret config
   If the codebase has ANY of these → auth IS required. Proceed to find the login endpoint details.

2. **Probe the live app to confirm and gather details** — use probe_url:
   - GET ${baseUrl}/ — check the response. NOTE: Many apps (forums, wikis, CMS, blogs) serve PUBLIC pages without auth. A 200 response on the homepage does NOT mean auth is unnecessary.
   - Search the codebase for actual protected routes (admin panels, user settings, API endpoints with auth middleware) and probe THOSE specific paths.
   - Check for login/session endpoints found in the codebase (not generic guesses).

3. **Find the login endpoint** — search for auth controllers, login routes, sign-in handlers. IMPORTANT: distinguish between the HTML login PAGE (e.g. /login) and the API endpoint that PROCESSES credentials (e.g. POST /session, POST /api/auth/login). Read the handler code to determine:
   - The exact API endpoint that processes login (NOT the page that renders the login form)
   - The exact request body field names (e.g. "user", "email", "username", "password"). NOTE: the login form may label the field "Email" in the UI but the API field is actually called "username" (and vice versa). Always check the actual HTML input 'name' attribute or the controller's expected parameter names, not just the UI label.
   - How the token/session is returned: response body field, response header, or Set-Cookie
   - Whether it's session-based (cookies), JWT (token in body/header), or API key
   For loginEndpoint, always use the API endpoint path. If unsure, probe POST to candidate endpoints to find the one that accepts credentials.

4. **Find real credentials** — search docker-compose files, .env files, seed/fixture files, README for default users/passwords. NEVER invent credentials — only use values found in the actual codebase. If none found, set loginBody to null.

5. **Find the registration endpoint** (if applicable) — if no seeded users exist, find a signup/register route and build a registerBody with consistent test credentials.

6. **Identify a protected endpoint** — find a route with auth middleware applied (e.g. before_action, @login_required, passport.authenticate) that returns 401/403/302 when unauthenticated. Use probe_url to VERIFY it actually requires auth.

CRITICAL RULES:
- If the codebase has authentication mechanisms (login controllers, session management, auth middleware, password hashing, CSRF tokens), then requiresAuth IS true — regardless of what HTTP probes return.
- Many apps (forums, wikis, CMS, e-commerce) have public pages that return 200 without auth. This does NOT mean auth is unnecessary. These apps still need auth for admin, posting, user profiles, and API operations.
- If probe responses return HTML when you requested JSON (Accept: application/json), the app may be serving a catch-all page (setup wizard, SPA shell). This does NOT mean the endpoint is unprotected.
- If EVERY endpoint returns 200 with similar HTML content, the app is likely in a special state (setup wizard, SPA with client-side routing). Auth IS almost certainly still required.
- Default to requiresAuth: true. Only set requiresAuth: false if you are CERTAIN the app has no auth at all (no login endpoint, no session management, no user model, no auth middleware anywhere in the codebase).

Base URL: ${baseUrl}`,
    },
    {
      role: "user",
      content: `Analyze the authentication for this app.

Search the codebase and read files before answering.

Return a JSON object:
{
  "requiresAuth": true/false,
  "authType": "jwt" | "session" | "api_key" | "basic" | "oauth" | "none",
  "loginEndpoint": "/api/auth/login" or null,
  "loginMethod": "POST" or null,
  "loginBody": "{\\"user\\":\\"actual-user\\",\\"password\\":\\"actual-pass\\"}" or null,
  "loginContentType": "json" | "form" | "xml",
  "tokenLocation": "body" | "header" | "cookie",
  "tokenFieldPath": "token" or "authorization" or null,
  "tokenEmbedLocation": "header" | "cookie" | "query",
  "headerName": "Authorization" or null,
  "headerPrefix": "Bearer " or "" or null,
  "cookieName": "session" or null,
  "queryParamName": "token" or null,
  "reauthIndicator": "status" | "redirect" | "body",
  "reauthBodyPattern": "regex pattern" or null,
  "protectedEndpointPath": "/api/protected" or null,
  "registerEndpoint": "/register" or null,
  "registerMethod": "POST" or null,
  "registerBody": "email=test@test.com&password=pass" or null,
  "notes": "brief description"
}

Key rules:
- loginBody values MUST come from seed data, env vars, or code you actually read
- If no credentials found but registration exists, invent consistent test credentials for both registerBody and loginBody
- loginBody format must match loginContentType: URL-encoded for "form", JSON for "json"
- tokenLocation: read the login handler to determine if token is in response body, header, or cookie
- protectedEndpointPath: find a route with auth middleware in the codebase and confirm it requires authentication`,
    },
  ];
}

/**
 * Prompt for auth configuration phase (auth object creation only).
 * User creation is handled by the separate seedUser sub-phase.
 */
export function configureAuthPrompt(
  baseUrl: string,
  testUrl: string,
  detection: AuthDetectionInput,
  userConfirmed: boolean,
  preProbeContext?: string,
): ChatCompletionMessageParam[] {
  const authStyle = detection.authType === "session" ? "session"
    : detection.authType === "jwt" ? "jwt"
    : detection.authType === "api_key" ? "api_key"
    : "session";

  const credentialNote = userConfirmed
    ? `\nA test user has been created and confirmed. Credentials: ${detection.loginBody ?? "unknown"}. Proceed with probing and auth object creation.`
    : `\nNo confirmed user exists. Credentials from codebase: ${detection.loginBody ?? "unknown"}. These may not work — if auth tests fail, diagnose with command tools and try different credentials or respond INFRA_REPAIR if the issue is infrastructure.`;

  return [
    {
      role: "system",
      content: `You are an expert at configuring Bright DAST authentication objects. Your job is to create a working auth object and verify it passes all tests. You have many rounds available — use ALL of them. Do NOT give up early.

## Context
- Base URL: ${baseUrl}
- Auth type: ${detection.authType} (use authStyle="${authStyle}")
- Login: ${detection.loginMethod ?? "POST"} ${detection.loginEndpoint ?? "unknown"}
- Login body: ${detection.loginBody ?? "unknown"}
- Content type: ${detection.loginContentType}
- Token: ${detection.tokenLocation} → embed via ${detection.tokenEmbedLocation}
- Token field: ${detection.tokenFieldPath ?? "unknown"}
- Cookie: ${detection.cookieName ?? "none"}
- Reauth: ${detection.reauthIndicator}
- Suggested test URL: ${testUrl}
${credentialNote}

## Available tools
- **probe_url** — Make HTTP requests to the running app. Use for DISCOVERY: finding real endpoints, checking response formats, understanding what the app returns. Cookies are tracked automatically across calls.
- **run_command_on_host** — ⚠️ DIAGNOSTIC ONLY. Run read-only shell commands on the host (docker ps, docker logs, docker inspect, printenv). Do NOT restart, kill, or modify anything.
- **run_command_in_docker** — ⚠️ DIAGNOSTIC ONLY. Run read-only commands inside a Docker container (check user state, inspect environment, query database). Do NOT restart processes, kill PIDs, or modify config files.
- **read_file / search_files / list_files** — Inspect the codebase to understand auth flow.
- **search_web** — Search the internet for how this app handles authentication, API endpoints, CSRF tokens, etc. Use when probe_url returns unexpected results and codebase inspection isn't enough.
- **fetch_url** — Fetch full content of a web page (e.g. app documentation, Stack Overflow answer). Large pages are saved to .bright-fetched-page.txt — use read_file to see full content.
- **create_auth** — Create a Bright auth object with simplified parameters. Best for standard session/cookie, JWT, and API key flows where CSRF is in a **JSON endpoint** or a **Rails meta tag**. Do NOT use for Django/Laravel-style CSRF hidden form fields.
- **create_auth_raw** — Create a Bright auth object with FULL multistep control. Use this for:
  - **CSRF tokens embedded in HTML form fields** (Django csrfmiddlewaretoken, Laravel _token, etc.) — you MUST use this because create_auth only injects CSRF as a header, but these frameworks expect it in the POST body
  - OAuth2 PKCE, authorization code grants, or any multi-step token exchange
  - Any flow where you need to extract values between steps using NexTemplate
- **test_auth_object** — Test if the auth object works end-to-end. Returns stage-by-stage results. Use this as your source of truth.
- **delete_auth_object** — Delete a broken auth object to recreate with different settings.

## When to use create_auth vs create_auth_raw
- **create_auth**: Standard flows — single login POST that returns a cookie or JWT. CSRF must come from a **JSON endpoint** (e.g. /session/csrf returns {"csrf":"token"}). Works for: Discourse, Rails (API mode), Express, most SPA backends.
- **create_auth_raw**: Use when you need full control over steps and request bodies. **REQUIRED for:**
  1. **HTML form CSRF** (Django, Laravel, classic server-rendered apps) — the CSRF token is a hidden input field in the HTML form. You extract it from the GET response body and inject it into the POST body (not a header).
  2. **OAuth2 PKCE / authorization code** — multi-step flows with token exchange.
  3. **Any flow where create_auth fails** — when you need to customize exactly what gets sent.

  With create_auth_raw, you define each step and use NexTemplate expressions to pass values between steps:
  - Body extraction: {{ auth_object.stages.<step_name>.response.body | match: /<regex_with_capture_group>/ }}
  - Header extraction: {{ auth_object.stages.<step_name>.response.headers.<HeaderName> | match: /<regex>/ }}
  Use followRedirects: false on steps where you need to capture the Location header (e.g. OAuth2 authorize → 302).

### Example: Django CSRF (csrfmiddlewaretoken in HTML form)
Django renders a hidden input \`<input type="hidden" name="csrfmiddlewaretoken" value="TOKEN...">\` in the login page.
You MUST use create_auth_raw to embed it in the POST body:
\`\`\`
steps: [
  { name: "get_csrf", request: { method: "GET", url: "http://localhost:8080/login", protocol: "http" }, successResponseDetection: [{ type: "status", statuses: [200] }] },
  { name: "login", request: { method: "POST", url: "http://localhost:8080/login", protocol: "http",
    headers: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }],
    body: "csrfmiddlewaretoken={{ auth_object.stages.get_csrf.response.body | match: /csrfmiddlewaretoken\"\\s+value=\"([^\"]+)\"/ }}&username=bright_test&password=BrightTest123%21",
    followRedirects: false, maxRedirects: 0 },
    successResponseDetection: [{ type: "status", statuses: [200, 302] }] }
]
reauthTriggers: [{ type: "TRIGGER", location: "status", statuses: [401, 403] }, { type: "OR" }, { type: "TRIGGER", location: "header", name: "Location", patterns: ["login"] }]
\`\`\`
Key: the CSRF token goes IN the body with NexTemplate, NOT as a header. URL-encode special characters in the password (! → %21).

### Example: Laravel CSRF (_token in HTML form)
Same pattern — extract _token from the HTML form and inject into POST body:
\`\`\`
steps: [
  { name: "get_csrf", request: { method: "GET", url: "http://localhost:8000/login", protocol: "http" }, successResponseDetection: [{ type: "status", statuses: [200] }] },
  { name: "login", request: { method: "POST", url: "http://localhost:8000/login", protocol: "http",
    headers: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }],
    body: "_token={{ auth_object.stages.get_csrf.response.body | match: /name=\"_token\"\\s+value=\"([^\"]+)\"/ }}&email=bright@test.com&password=BrightTest123%21",
    followRedirects: false, maxRedirects: 0 },
    successResponseDetection: [{ type: "status", statuses: [200, 302] }] }
]
\`\`\`

## Workflow

### Step 1: Discover the REAL login API endpoint
The detected loginEndpoint may be an HTML page (e.g. /login) rather than the API endpoint that processes credentials.
1. Check the pre-probe results — if loginEndpoint is marked as "HTML page", do NOT use it as loginUrl
2. Look for "Candidate API login" entries in the pre-probe — those are the real API endpoints
3. If unsure, probe POST to common API patterns with an empty body — 403/422/400 means it's the right endpoint (rejected creds), 404 means wrong:
   - POST ${baseUrl}/session
   - POST ${baseUrl}/api/session
   - POST ${baseUrl}/api/auth/login
   - POST ${baseUrl}/auth/sign_in
4. Also search the codebase: search for route definitions that handle POST login/session

### Step 2: Discover test URL candidates using probe_url
1. Probe several .json endpoints WITHOUT auth to find ones that return different content when authenticated:
   - Endpoints returning 401/403 are ideal testUrls
   - Endpoints returning 200 with "login_required" or "not_logged_in" in the body need reauthStrategy='body'
   - Endpoints returning 200 with the same content regardless of auth are USELESS as testUrls — skip them
   - Endpoints returning 404 are USELESS — skip them
2. Note down exactly what the unauthenticated response looks like (status, body pattern) for each candidate

### Step 3: Create auth object and use test_auth_object to verify
1. Call create_auth with your best parameters — use the REAL API endpoint as loginUrl (NOT an HTML page)
2. Call test_auth_object — this is the source of truth. It returns FULL diagnostic data for each stage:
   - **request**: method, URL, body sent
   - **response**: HTTP status, body preview (first 800 chars), Set-Cookie headers, content-type
3. Read the test results carefully for EACH stage — especially the **response body preview**:

   **If "validation" fails** ("did not match any auth triggers"):
   → The testUrl returns the same response regardless of auth. The Bright platform cannot distinguish auth/unauth.
   → Fix: pick a DIFFERENT testUrl. Use probe_url to find one where authenticated vs unauthenticated responses differ.
   → If no endpoint returns 401/403, use reauthStrategy='body' with a reauthBodyPattern that matches the UNAUTHENTICATED body.

   **If "authentication" fails**:
   → The login request itself failed. Possible causes:
   - Wrong loginUrl (HTML page instead of API endpoint)
   - Wrong credentials
   - Missing CSRF token — add csrfUrl
   - Wrong loginBody format (json vs form mismatch)
   - **Login returned HTTP 500 with Content-Type text/html** — the server tried to render HTML but crashed (e.g. missing ImageMagick or other system dependency). TWO actions:
     1. QUICK FIX: recreate auth with loginAccept='application/json' to request JSON response instead of HTML
     2. ROOT CAUSE: use run_command_in_docker to check app logs for the actual error. If it's a missing dependency, respond with INFRA_REPAIR — broken HTML rendering means client-side security tests (XSS, CSS injection, etc.) won't work either.
   → Fix: probe the login endpoint to understand what it expects, then recreate.

   **If "authentication" succeeds but response body is HTML (not JSON)**:
   → The server returned 200 but with an HTML error/warning page instead of a real login response.
   → This means login was NOT actually processed. Common causes:
   - App running in dev mode and needs an environment variable (e.g. ALLOW_EMBER_CLI_PROXY_BYPASS=1)
   - Server is redirecting to a setup/install page
   - User account not activated/confirmed (check with run_command_in_docker)
   → Fix: Use run_command_on_host/run_command_in_docker to DIAGNOSE the root cause, then respond with INFRA_REPAIR if it requires a container restart or compose change.

   **If "authorization" fails** ("Status is in Set{401, 403}" or body pattern match):
   → Login appeared to succeed but the test request was still unauthenticated.
   → **CHECK THE LOGIN RESPONSE** — look at the authentication stage's response body and Set-Cookie headers:
     - If the login response body is HTML (not JSON), login did NOT actually work — fix the application first
     - If the login response has no new Set-Cookie headers, the session wasn't established
     - If the login response body contains error messages, credentials or format are wrong
   → Fix: address the root cause found in the login response, try different testUrl, try reauthStrategy='body'.

4. Delete the failed auth object and try a DIFFERENT approach. Change one thing at a time:
   - Different loginUrl (API vs HTML)
   - Different testUrl
   - Different reauthStrategy (status → body → redirect)
   - Different loginBody format (json vs form)
   - **Different credential field names** — many apps accept EITHER "username" or "email" for the login identifier. If {"username":"bright@test.com","password":"..."} fails, try {"email":"bright@test.com","password":"..."} and vice versa. Also try {"login":"..."}, {"user":{"email":"...","password":"..."}} (nested). Check the login form HTML — the input field 'name' attribute tells you exactly what the server expects.
   - Add/remove csrfUrl
   - Add loginAccept='application/json' if login returns HTML error pages
   - Add cookieUrl (app root URL) if CSRF token fails despite being correct (session cookie needed before CSRF)
   - **Switch to create_auth_raw if CSRF is in an HTML form field** — if the login page has a hidden input like \`<input type="hidden" name="csrfmiddlewaretoken" value="...">\` (Django) or \`<input type="hidden" name="_token" value="...">\` (Laravel), you MUST use create_auth_raw because create_auth only injects CSRF as a header, but these frameworks require it in the POST body. See the Django/Laravel examples in the "When to use create_auth vs create_auth_raw" section above. This is NOT an infrastructure problem — do NOT respond with INFRA_REPAIR for CSRF issues.
   - **Switch to create_auth_raw for OAuth2/PKCE/multi-step flows** — if the app uses Bearer tokens obtained via authorization code exchange, build the full step chain: login POST → authorize GET (followRedirects:false) → token POST → Bearer embedder.
   - **If the application itself is misconfigured**, diagnose with command tools and respond with INFRA_REPAIR

## CRITICAL PERSISTENCE RULES
- **NEVER respond with "FAILED" until you have exhausted ALL of the following strategies:**
  1. At least 3 different loginUrl candidates (the detected one + API alternatives)
  2. At least 3 different testUrl candidates
  3. Both reauthStrategy='status' and reauthStrategy='body' with reauthBodyPattern
  4. Both json and form loginContentType
  5. With and without csrfUrl
  6. Different credential field names — try "username", "email", "login" as the identifier field; some apps use the email address in the "username" field, others have a separate "email" field
  7. **create_auth_raw is MANDATORY before giving up** — you MUST try create_auth_raw for: (a) HTML form CSRF (Django csrfmiddlewaretoken, Laravel _token, any hidden form field), (b) OAuth2/PKCE/multi-step token exchange, (c) any case where create_auth keeps failing. CSRF extraction issues are auth config problems — do NOT request INFRA_REPAIR for them.
  8. **If login responses contain HTML error pages or misconfiguration warnings**, diagnose with command tools and respond with INFRA_REPAIR — do NOT try to fix the app yourself (no killing processes, no restarting containers, no modifying files)
- **After each failed test_auth_object, analyze the response body previews for EACH stage to understand the root cause.**
- **Use probe_url between attempts to gather more data** — probe new endpoints, check response formats, search the codebase for auth routes.
- **You have 50 rounds. Use them ALL before giving up.** Each create/test/delete cycle takes ~3 rounds. You can try 15+ different configurations.

## Response format
- When all stages pass, respond with ONLY the auth object ID.
- If the problem is an **infrastructure issue that requires restarting the application** (e.g. missing environment variable in docker-compose, wrong Dockerfile config, app needs to be rebuilt with different settings), respond with:
  \`INFRA_REPAIR: <description of what needs to change>\`
  Examples:
  - \`INFRA_REPAIR: Add ALLOW_EMBER_CLI_PROXY_BYPASS=1 to the app service environment in compose.yml — without it, Discourse returns HTML for all API requests instead of processing them\`
  - \`INFRA_REPAIR: The app's DATABASE_URL points to localhost but the DB is in a separate container — change it to postgres://db:5432 in compose.yml\`
  - \`INFRA_REPAIR: The Rails app needs RAILS_ENV=production in compose.yml — development mode requires Ember CLI which is not available\`
  Use INFRA_REPAIR when: you've identified the root cause, it requires changing compose.yml/Dockerfile/environment, and you CANNOT fix it from inside the running container (e.g. env vars set at startup, Docker build changes, service configuration). Do NOT use INFRA_REPAIR for auth config issues — only for app infrastructure problems.
- If you truly exhausted everything and the problem is NOT infrastructure, respond "FAILED".`,
    },
    {
      role: "user",
      content: `Create and test a working auth object for this application. Return only the auth object ID when it passes.${preProbeContext ? `\n\n## Pre-probe results (already fetched for you)\n${preProbeContext}` : ""}`,
    },
  ];
}

/**
 * Prompt for the "seed user" sub-phase.
 * Single mission: create a test user in the running app and verify it exists.
 */
export function seedUserPrompt(
  baseUrl: string,
  detection: AuthDetectionInput,
): ChatCompletionMessageParam[] {
  const loginInfo = detection.loginEndpoint
    ? `- Login endpoint: ${detection.loginMethod ?? "POST"} ${detection.loginEndpoint}`
    : "";
  const bodyInfo = detection.loginBody
    ? `- Detected login body format: ${detection.loginBody}`
    : "";

  return [
    {
      role: "system",
      content: `You are a DevOps engineer. Your ONLY mission is to create a test user in the running application so that DAST authentication can work.

## Context
- Base URL: ${baseUrl}
- Auth type: ${detection.authType}
${loginInfo}
${bodyInfo}

## Target credentials
Create a user with these exact credentials:
- username: bright_test
- email: bright@test.com
- password: BrightTest123!
- Make the user an admin/superuser if possible

## Tools available
- **run_command_on_host** — Run shell commands on the host (docker ps, docker logs, etc.)
- **run_command_in_docker** — Run commands inside a Docker container (create users, framework CLI)
- **probe_url** — Make HTTP requests to the running app
- **read_file / search_files / list_files** — Inspect the codebase
- **search_web** — Search the internet for how to create users in this specific framework. Use when the codebase doesn't make user creation obvious or when initial attempts fail with unfamiliar errors.
- **fetch_url** — Fetch full content of a web page (docs, Stack Overflow). Large pages are saved to .bright-fetched-page.txt — use read_file to see full content.

## Strategy
1. Find the Docker container: run_command_on_host("docker ps --format '{{.ID}} {{.Names}} {{.Image}}'")
2. Research how to create users in this app:
   - search_files for User model, schema, migration
   - read_file on the User model to understand required fields, validations, password hashing
   - Check the framework (Gemfile, package.json, requirements.txt, etc.)
3. Create the user via docker exec + framework CLI. Common patterns:
   - **Rails**: run_command_in_docker(container: "<id>", command: "cd /src && RAILS_ENV=development bundle exec rails runner \"u = User.new(username: :bright_test, email: :bright@test.com, password: :BrightTest123!, admin: true, active: true, approved: true); u.save!(validate: false)\"")
   - **Django**: run_command_in_docker(container: "<id>", command: "python manage.py shell -c \"from django.contrib.auth.models import User; User.objects.create_superuser('bright_test', 'bright@test.com', 'BrightTest123!')\"")
   - **Laravel**: run_command_in_docker(container: "<id>", command: "php artisan tinker --execute=\"\\App\\Models\\User::create(['name'=>'bright','email'=>'bright@test.com','password'=>Hash::make('BrightTest123!')])\"")
   - **Node/Express**: run_command_in_docker(container: "<id>", command: "node -e \"const db = require('./models'); db.User.create({...})\"")
4. **CRITICAL — Activate/confirm the user account:**
   Many apps require email verification before login works. After creating the user, you MUST ensure the account is fully activated:
   - **Rails/Discourse**: run_command_in_docker to execute: "u = User.find_by(username: 'bright_test'); u.active = true; u.approved = true; u.save!(validate: false); u.email_tokens.each { |t| EmailToken.confirm(t.token) rescue nil }; u.user_emails.update_all(confirmed: true) rescue nil"
   - **Django**: Ensure is_active=True (usually default for create_superuser)
   - **Laravel**: Set email_verified_at = now()
   - **General**: Look for email_confirmed, verified, activated, or similar fields and set them to true
   - **Check**: After activation, verify with a query: "User.find_by(username: 'bright_test').active?" or equivalent
5. If the first attempt fails, READ the error message, then:
   - Read the User model source code to understand required fields and validations
   - Try save!(validate: false) or equivalent to bypass validations
   - **If you change the password to bypass validation, REMEMBER the new password — you must report it in the output**
   - Try alternative CLI commands (e.g. "bundle exec rake" vs "rails runner")
   - Try the app's built-in admin/seed commands
   - Try raw SQL: docker exec <db-container> psql -U postgres -d <dbname> -c "INSERT INTO users..."
6. VERIFY the user exists AND is activated:
   - Run a query: docker exec <id> ... "puts User.find_by(username: 'bright_test').present?"
   - Or probe the login endpoint to confirm credentials work

## Output
When the user is created and verified, respond with ONLY this JSON:
{"success": true, "username": "bright_test", "password": "<ACTUAL_PASSWORD>", "email": "bright@test.com"}

⚠️ CRITICAL: The "password" field MUST be the EXACT password that was saved to the database.
If you had to modify the password to bypass validations (e.g. changed "BrightTest123!" to "BrightTest123!__" or any other variant), report the MODIFIED password — NOT the original target.
The auth phase will use this password to log in. If it's wrong, authentication will silently fail.

If you exhausted all approaches and cannot create a user, respond with:
{"success": false, "reason": "brief explanation"}

## Rules
- Be persistent. Try at least 5 different approaches before giving up.
- Read error messages carefully — they tell you what fields are missing or what format is expected.
- When docker exec fails, check if the container is running and which shell/tools are available.
- Do NOT give up after one failure. Adapt and retry.`,
    },
    {
      role: "user",
      content: "Create a test user in the running application. Return the JSON result.",
    },
  ];
}

/**
 * Prompt for the "repair broken login" sub-phase.
 * When the login endpoint returns HTTP 5xx, this LLM session diagnoses the
 * issue and tries to fix the app (complete setup wizards, run migrations,
 * fix configuration, etc.).
 */
export function repairBrokenLoginPrompt(
  baseUrl: string,
  diagnostic: string,
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `You are a DevOps engineer debugging a web application whose login endpoint is BROKEN (returning HTTP 500). Your mission is to diagnose and fix the issue so that login works.

## Situation
The application is running in Docker and serves pages, but the login endpoint crashes with a server error. This often happens when:
1. **Setup wizard incomplete** — The app is in first-run mode and requires initial setup (admin registration, config wizard) before normal login works. Look for setup/install/wizard routes.
2. **Database migrations missing** — Schema changes haven't been applied.
3. **Missing configuration** — Required environment variables, secrets, or config files are absent.
4. **Service dependencies** — A required service (Redis, Elasticsearch, etc.) is down or misconfigured.
5. **Asset compilation** — Frontend assets not compiled, app in wrong mode (development vs production).

## Pre-check diagnostic
${diagnostic}

## Tools available
- **run_command_on_host** — Run shell commands on the host (docker ps, docker logs, docker exec, curl, etc.)
- **run_command_in_docker** — Run commands inside a Docker container
- **probe_url** — Make HTTP requests to the running app (cookies tracked across calls)
- **read_file / search_files / list_files** — Inspect the application codebase
- **search_web** — Search the internet for solutions specific to this app/framework
- **fetch_url** — Fetch documentation pages

## Strategy

### 1. Gather information
- Check container logs: \`docker logs <container> --tail 200\` for recent errors
- Check the app's routes/pages for setup wizards:
  - Probe GET ${baseUrl}/ and look for redirects to /setup, /install, /finish-installation, /wizard, etc.
  - Probe common setup URLs: ${baseUrl}/setup, ${baseUrl}/install, ${baseUrl}/finish-installation/register
  - Search codebase for setup/installation routes
- Check database state: look for pending migrations, empty tables
- Check service health: redis-cli ping, database connections, etc.

### 2. Fix the issue
Common fixes:
- **Complete setup wizard**: POST to the setup endpoint with admin credentials (e.g. register an admin user through the setup form)
- **Run migrations**: \`docker exec <container> <migration-command>\` (e.g., rails db:migrate, python manage.py migrate)
- **Set environment variables**: Restart container with correct env vars
- **Fix configuration**: Edit config files inside the container
- **Install missing dependencies**: apt-get install, npm install, bundle install
- **Restart services**: Restart the app process inside the container

### 3. Verify the fix
After each fix attempt:
1. Probe the login endpoint again to check if it still returns 500
2. If it now returns 200/302/403/422, the fix worked → success
3. If still 500, check logs for the NEW error and try a different approach

## Output
When the login endpoint is functional (no longer returning 5xx), respond with:
{"fixed": true, "action": "brief description of what you did"}

If you exhausted all approaches, respond with:
{"fixed": false, "reason": "brief explanation of what's wrong"}

## Rules
- Be persistent. Try at least 5 different diagnostic/fix approaches before giving up.
- READ error messages and logs carefully — they tell you exactly what's wrong.
- After each fix attempt, ALWAYS re-probe the login endpoint to verify.
- Focus on making login FUNCTIONAL, not perfect. A 403 "bad CSRF" or 422 "invalid credentials" means the endpoint WORKS.
- You have up to 30 rounds. Use them wisely — diagnose first, then fix.`,
    },
    {
      role: "user",
      content: `The login endpoint is broken. Diagnose and fix the application. Base URL: ${baseUrl}`,
    },
  ];
}
