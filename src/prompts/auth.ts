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
   - The exact request body field names (e.g. "user", "email", "username", "password")
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
    : `\nNo confirmed user exists. Credentials from codebase: ${detection.loginBody ?? "unknown"}. These may not work — if auth tests fail, try creating a user via run_command_in_docker.`;

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
- **run_command_on_host** — Run shell commands on the host (docker ps, docker logs, etc.).
- **run_command_in_docker** — Run commands inside a Docker container (create users, inspect environment).
- **read_file / search_files / list_files** — Inspect the codebase to understand auth flow.
- **search_web** — Search the internet for how this app handles authentication, API endpoints, CSRF tokens, etc. Use when probe_url returns unexpected results and codebase inspection isn't enough.
- **fetch_url** — Fetch full content of a web page (e.g. app documentation, Stack Overflow answer). Large pages are saved to .bright-fetched-page.txt — use read_file to see full content.
- **create_auth** — Create a Bright auth object. This is the ONLY way to properly test login — it handles cookies, CSRF, redirects correctly.
- **test_auth_object** — Test if the auth object works end-to-end. Returns stage-by-stage results. Use this as your source of truth.
- **delete_auth_object** — Delete a broken auth object to recreate with different settings.

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
2. Call test_auth_object — this is the source of truth
3. Read the test results carefully for EACH stage:

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
   → Fix: probe the login endpoint to understand what it expects, then recreate.

   **If "authorization" fails** ("Status is in Set{401, 403}" or body pattern match):
   → Login succeeded but the test request was still unauthenticated. The session/token wasn't applied.
   → This often means: login returned cookies but the Bright platform didn't replay them correctly, OR the app needs a specific cookie/header flow.
   → Fix: try different testUrl, try reauthStrategy='body' instead of status, check if the app needs additional headers.

4. Delete the failed auth object and try a DIFFERENT approach. Change one thing at a time:
   - Different loginUrl (API vs HTML)
   - Different testUrl
   - Different reauthStrategy (status → body → redirect)
   - Different loginBody format (json vs form)
   - Add/remove csrfUrl

## CRITICAL PERSISTENCE RULES
- **NEVER respond with "FAILED" until you have exhausted ALL of the following strategies:**
  1. At least 3 different loginUrl candidates (the detected one + API alternatives)
  2. At least 3 different testUrl candidates
  3. Both reauthStrategy='status' and reauthStrategy='body' with reauthBodyPattern
  4. Both json and form loginContentType
  5. With and without csrfUrl
- **After each failed test_auth_object, analyze the specific failure stage and change your approach accordingly.**
- **Use probe_url between attempts to gather more data** — probe new endpoints, check response formats, search the codebase for auth routes.
- **You have 50 rounds. Use them ALL before giving up.** Each create/test/delete cycle takes ~3 rounds. You can try 15+ different configurations.
- When all stages pass, respond with ONLY the auth object ID. If you truly exhausted everything, respond "FAILED".`,
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
4. If the first attempt fails, READ the error message, then:
   - Read the User model source code to understand required fields and validations
   - Try save!(validate: false) or equivalent to bypass validations
   - **If you change the password to bypass validation, REMEMBER the new password — you must report it in the output**
   - Try alternative CLI commands (e.g. "bundle exec rake" vs "rails runner")
   - Try the app's built-in admin/seed commands
   - Try raw SQL: docker exec <db-container> psql -U postgres -d <dbname> -c "INSERT INTO users..."
5. VERIFY the user exists:
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
