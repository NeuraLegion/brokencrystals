# Bright Agent

An agentic DAST solution by [Bright Security](https://www.brightsec.com/) that autonomously analyzes, builds, scans, validates, and fixes security vulnerabilities in your applications — dynamically.

**Cross-AI. Cross-Repository. Fully automated.**

## What It Does

Bright Agent clones your repository, understands your tech stack, starts your application, runs dynamic security scans against live endpoints, and generates verified code fixes — all without human intervention. When fixes break the app, it detects, repairs, or reverts automatically.

- Works with **any AI provider** — OpenAI, GitHub Models, Ollama, or any OpenAI-compatible API
- Works with **any major SCM** — GitHub, Azure DevOps (GitLab coming soon)
- Works with **any tech stack** — Node.js, Python, .NET, Java, Go, Ruby, PHP, and more
- Produces **pull requests** with validated fixes, ready to merge

## Key Features

- **Autonomous Workflow** — Analyze → Build → Scan → Fix → Validate, in a loop up to 5 passes
- **Dynamic Scanning** — Real DAST against a running application, not static pattern matching
- **Multi-Platform SCM** — Auto-detects GitHub or Azure DevOps from the repository URL; opens PRs on either
- **Any LLM Provider** — OpenAI, GitHub Models, Ollama, or custom endpoints; model escalation on failure
- **Smart Auth Detection** — Finds JWT, API keys, sessions, OAuth flows; configures multistep login automatically
- **Function Harness Mode** — Falls back to wrapping critical functions when full startup fails
- **Fix Validation** — Detects when fixes break the app, repairs or reverts automatically
- **Per-Endpoint Test Selection** — LLM picks relevant security tests per endpoint (SQLi, XSS, SSRF, etc.)

## How It Works

Bright Agent runs a multi-phase pipeline, repeating the scan → fix → validate loop up to 5 times:

1. **Analyze** — Detects tech stack and discovers HTTP endpoints from code + OpenAPI specs
2. **Build & Start** — Installs dependencies, generates Dockerfiles if needed, starts the app locally
3. **Connect** — Sets up a Bright Repeater to bridge the local app to the Bright cloud scanner
4. **Detect Auth** — Identifies auth mechanisms (JWT, API keys, OAuth) and configures multistep login flows
5. **Register Endpoints** — Sends discovered endpoints to Bright with per-endpoint auth mapping
6. **Select Tests** — LLM picks relevant security tests per endpoint (SQLi, XSS, SSRF, BOLA, etc.)
7. **Scan** — Launches Bright DAST scans against the live app
8. **Fix** — For each finding: taint analysis → LLM-generated patch → apply → restart → validate
9. **Repeat** — Re-scans to verify fixes and catch regressions; exits when clean or max passes reached

If full startup or auth fails, the agent falls back to **function harness mode** — wrapping security-critical functions (SQL queries, file I/O, command execution) in a lightweight HTTP server and scanning those directly.

## Configuration

### Required

| Variable            | Required | Description                                                                      |
| ------------------- | -------- | -------------------------------------------------------------------------------- |
| `REPOSITORY_URL`    | **Yes**  | Full URL of the target repository. Auto-detects platform (GitHub / Azure DevOps) |
| `REPO_ACCESS_TOKEN` | **Yes**  | Personal access token for git clone, push, and PR operations                     |
| `BRIGHT_TOKEN`      | **Yes**  | API key from [app.brightsec.com](https://app.brightsec.com)                      |

Supported `REPOSITORY_URL` formats:
- **GitHub**: `https://github.com/owner/repo`
- **Azure DevOps**: `https://dev.azure.com/org/_git/repo` or `https://dev.azure.com/org/project/_git/repo`

### AI / Inference

| Variable              | Required | Description                                                                                                                                      |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPENAI_API_KEY`      | Varies   | API key for OpenAI. Takes priority over other token vars                                                                                         |
| `INFERENCE_TOKEN`     | Varies   | Inference token (e.g. for GitHub Models). Fallback after `OPENAI_API_KEY`                                                                        |
| `INFERENCE_URL`       | No       | Inference API base URL. Default: `https://api.openai.com/v1`. Also supports GitHub Models and Ollama                                             |
| `AI_MODEL`            | No       | Model name or comma-separated escalation chain (e.g. `gpt-4.1-mini,gpt-4.1,o3`). Default: `gpt-5.4-mini`                                       |
| `AI_REASONING_EFFORT` | No       | Reasoning effort for thinking models: `low`, `medium`, `high`, or `none`. Default: `medium`                                                     |
| `INFERENCE_PROVIDER`  | No       | Force provider: `openai`, `github-models`, or `ollama`. Auto-detected from URL if omitted                                                       |

### Optional

| Variable            | Required | Description                                                                                                                                                 |
| ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BRIGHT_PROJECT_ID` | No       | Bright project ID. Auto-detected if omitted                                                                                                                 |
| `BRIGHT_HOSTNAME`   | No       | Bright API hostname (default: `app.brightsec.com`)                                                                                                          |
| `RUN_MODE`          | No       | `full` (default) — start the full application and scan. `function` — skip full startup, wrap critical functions in a lightweight HTTP harness and scan those |
| `BRANCH`            | No       | Branch name for fixes (default: `bright-scan-<timestamp>`)                                                                                                  |
| `GIT_AUTHOR_NAME`   | No       | Git commit author name (default: `BrightSec`)                                                                                                               |
| `GIT_AUTHOR_EMAIL`  | No       | Git commit author email (default: `bot@brightsec.com`)                                                                                                      |
| `PROBLEM_STATEMENT` | No       | Problem description (default: `Run a security scan and fix vulnerabilities`)                                                                                |
| `ACTION`            | No       | Action to perform (default: `fix`)                                                                                                                          |

### Provider Examples

**OpenAI (default):**

```bash
export OPENAI_API_KEY="sk-..."
export AI_MODEL="gpt-4.1-mini"
```

**GitHub Models:**

```bash
export INFERENCE_URL="https://models.github.ai/inference"
export INFERENCE_TOKEN="ghp_..."
export AI_MODEL="openai/gpt-4.1-mini"
```

**Ollama (local):**

```bash
export INFERENCE_URL="http://localhost:11434"
export AI_MODEL="llama4:latest"
```

**Model escalation (auto-upgrade on failure):**

```bash
export AI_MODEL="gpt-4.1-mini,gpt-4.1,o3"
```

## Quick Start

```bash
# 1. Install & build
npm install
npm run build

# 2. Run
REPOSITORY_URL="https://github.com/owner/target-repo" \
REPO_ACCESS_TOKEN="your-github-or-azure-pat" \
BRIGHT_TOKEN="your-bright-api-token" \
OPENAI_API_KEY="your-openai-key" \
node dist/index.js
```

## Supported Security Tests

Tests are selected **per-endpoint** by the LLM based on the endpoint's technology, parameters, and purpose:

```
sqli, xss, stored_xss, ssrf, osi, lfi, ssti, xxe, open_redirect, nosql,
header_security, cookie_security, csrf, jwt, proto_pollution, secret_tokens,
directory_listing, insecure_tls, prompt_injection, bola, bopla, mass_assignment,
brute_force_login, broken_access_control, excessive_data_exposure, and more
```

Auth-dependent tests (BAC, BOLA, brute force, etc.) are automatically excluded when no auth is configured.

## Example Output

```
[Engine] Bright Agent starting...
[Engine] Repository: github.com/user/app (GitHub)

[Analyze] Detected: Node.js, Express, MongoDB
[Analyze] Found 12 HTTP endpoints

[Startup] Starting application: npm start (port 3000)
[App] Server listening on port 3000

[Setup] Repeater connected: repeater-xyz123

[Auth] Detected auth: jwt — Requires Authorization header with Bearer token

[Entrypoints] Registered 12 entrypoints

[Scan] Running security scan (pass 1/5)
[Scan] Completed: done (5 issues)

[Fix] Analyzing: SQL Injection at POST /api/users
[Fix] Generated fix: Added input validation and parameterized queries
[Fix] Applied 5 fixes

[Scan] Running security scan (pass 2/5)
[Scan] Completed: done (0 issues)

[Done] All vulnerabilities resolved. 5 total fixes applied.
```

## License

MIT

## References

- [Bright Security](https://www.brightsec.com)
- [Bright API Documentation](https://docs.brightsec.com)
- [Model Context Protocol](https://modelcontextprotocol.io)
