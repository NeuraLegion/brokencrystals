# Bright Security Copilot Engine

A GitHub Copilot Engine that performs automated security scanning and remediation using [Bright](https://www.brightsec.com/) DAST (Dynamic Application Security Testing). This agent analyzes your codebase, discovers HTTP endpoints, runs security scans, and automatically generates and applies fixes for vulnerabilities.

## Overview

This engine integrates with:

- **GitHub Copilot Engine SDK** (`@github/copilot-engine-sdk`) for orchestration and CI/CD integration
- **Bright API** for security scanning capabilities
- **OpenAI/Claude API** for LLM-driven code analysis and fix generation

The workflow follows a multi-phase scan-fix-validate loop, repeating up to 5 passes until vulnerabilities are resolved or max iterations reached.

## Architecture

### Core Components

```
src/
├── index.ts                  # Entry point
├── orchestrator.ts           # Main workflow + harness scan loop
├── mcp-client.ts            # Bright API wrapper
├── inference.ts             # LLM chat utilities + model escalation
├── tools.ts                 # Codebase analysis tools (read, list, search)
├── config.ts                # Configuration loading
├── progress.ts              # GitHub Engine progress reporter
├── utils.ts                 # Shared utilities (sleep, formatTechStack, toErrorMessage)
├── types.ts                 # TypeScript interfaces
│
├── phases/                  # Workflow phases
│   ├── analyze.ts          # 1. Tech stack & endpoint discovery
│   ├── startup.ts          # 2. Start application locally
│   ├── swagger.ts          # 2b. OpenAPI/Swagger spec discovery
│   ├── repeater.ts         # 3. Bright Repeater setup
│   ├── auth.ts             # 4. Auth detection & configuration (multistep)
│   ├── entrypoints.ts      # 5. Register endpoints with Bright
│   ├── test-selection.ts   # 6. Per-endpoint security test selection
│   ├── scan.ts             # 7. Run security scans (programmatic)
│   ├── findings.ts         # 8. Fetch vulnerability findings
│   ├── fix.ts              # 9. Generate, apply & validate fixes
│   └── harness.ts          # Function harness mode (fallback / standalone)
│
└── prompts/                # LLM prompts & schemas
    ├── discover-endpoints.ts
    ├── identify-startup.ts
    ├── generate-fix.ts
    ├── generate-dockerfile.ts
    └── harness.ts           # Prompts for function harness pipeline
```

## Workflow

The orchestrator executes the following workflow, repeating the scan-fix loop up to 5 times.

In **function harness mode** (`RUN_MODE=function`) or when full startup/auth fails, the engine falls back to wrapping critical functions in a lightweight HTTP server for scanning — see [Function Harness Mode](#function-harness-mode) below.

### Phase 1: Analyze Repository

- **Component**: `phases/analyze.ts`
- Detects tech stack (languages, frameworks, databases) from config files
- Discovers HTTP endpoints by analyzing route controllers
- Enriches endpoints with method signatures, parameters, headers, and body formats
- **Output**: List of `DiscoveredEndpoint` objects

### Phase 2: Start Application

- **Component**: `phases/startup.ts`
- Analyzes startup config (scripts, env vars, prerequisites, Docker)
- Generates a Dockerfile if needed (`prompts/generate-dockerfile.ts`)
- Runs prerequisites (npm install, pip install, etc.)
- Spawns the application process and waits for it to become ready
- **Fallback**: If startup fails, automatically falls back to function harness mode
- **Output**: Application running on localhost

### Phase 2b: Swagger / OpenAPI Discovery

- **Component**: `phases/swagger.ts`
- Probes for OpenAPI/Swagger spec (common paths + codebase hints)
- Merges spec-derived endpoints with static analysis results
- Swagger endpoints are authoritative for paths; static analysis fills in sample values
- **Output**: Enriched endpoint list

### Phase 3: Setup Repeater

- **Component**: `phases/repeater.ts`
- Creates a Bright Repeater (local proxy for scanning private/internal apps)
- Registers the repeater with Bright cloud service
- **Output**: Active repeater connection

### Phase 4: Detect & Configure Authentication

- **Component**: `phases/auth.ts`
- Analyzes codebase for auth mechanisms (JWT, API keys, sessions, OAuth)
- Determines login endpoints and token extraction logic
- Registers auth configuration with Bright — prefers **multistep** type for login-based auth (performs login, extracts token via NexTemplate interpolation, injects into scan requests)
- Uses correct Bright NexTemplate syntax: `{{ auth_object.stages.<step>.response.body | match: /regex/ }}`
- Maps individual endpoints to their auth objects
- **Output**: Per-endpoint auth mapping (`endpointAuthMap`)

### Phase 5: Register Entrypoints

- **Component**: `phases/entrypoints.ts`
- Programmatically registers discovered endpoints with Bright project
- Associates repeater and per-endpoint auth objects with each entrypoint
- Handles conflict responses by reusing existing entrypoints
- **Output**: List of entrypoint IDs ready for scanning

### Phase 6: Select Security Tests

- **Component**: `phases/test-selection.ts`
- LLM selects relevant security tests for each endpoint based on its technology, parameters, and auth
- Groups endpoints that share the same test set into scan groups for efficiency
- Auth-dependent tests (BAC, BOLA, brute force, etc.) are excluded when auth is not configured
- **Output**: `ScanGroup[]` — each with entrypoint IDs and test tags

### Phase 7: Run Security Scans

- **Component**: `phases/scan.ts`
- Programmatically launches one Bright scan per scan group (no LLM involved)
- Polls scan status until completion (up to 30 minutes per scan)
- Failed scan group launches don't crash the pipeline — only successful scans are tracked
- **Output**: Completed scans with vulnerabilities identified

### Phase 8: Fetch Findings

- **Component**: `phases/findings.ts`
- Retrieves critical/high/medium severity issues from completed scans
- Normalizes issue data for fix generation
- **Output**: List of `Finding` objects with vulnerability details

### Phase 9: Generate, Apply & Validate Fixes

- **Component**: `phases/fix.ts`
- For each finding, performs taint analysis to identify vulnerable code paths
- Generates fixes using LLM with context of affected files
- Applies fixes to repository and commits changes
- Restarts application for re-validation
- **If the fix breaks the app**: captures Docker container logs, lets the LLM diagnose and repair the broken code (up to 2 repair attempts), or reverts the fix commit as a fallback

### Cleanup

- Kills application and repeater processes
- Deletes the repeater from Bright to avoid stale entries
- Cleans up function harness infrastructure (standalone DB/Redis containers)
- Closes MCP connection

### Loop Strategy

- **Iterations**: Up to 5 passes (phases 7-9)
- **Early exit**:
  - No vulnerabilities found → exit successfully
  - All scan launches fail → exit with error
  - Fix breaks app and can't be repaired → revert and report
  - Max iterations reached → exit with remaining vulnerabilities reported

### Function Harness Mode

When enabled directly (`RUN_MODE=function`) or triggered as a fallback (startup failure, auth failure), the engine bypasses full application startup and instead:

1. **Identify infrastructure** — Reads compose files to find minimal services (DB, Redis) needed by the app's model layer
2. **Start minimal infra** — Spins up only the essential services and runs migrations
3. **Identify targets** — LLM performs data-flow analysis to find security-critical functions (SQL queries, file I/O, command execution, deserialization, template rendering, etc.)
4. **Generate harness** — LLM generates a single-file HTTP server (Sinatra/Express/Flask) that boots the framework model layer and wraps each target function as an endpoint
5. **Scan** — Registers harness endpoints with Bright (no auth needed) and runs security scans

This allows scanning applications that are difficult to start fully (complex infrastructure, interactive setup, broken builds) while still testing real code paths against real databases.

## Prerequisites

### Environment Variables

#### Bright (required)

| Variable            | Required | Description                                                 |
| ------------------- | -------- | ----------------------------------------------------------- |
| `BRIGHT_TOKEN`      | **Yes**  | API key from [app.brightsec.com](https://app.brightsec.com) |
| `BRIGHT_PROJECT_ID` | No       | Project ID. Auto-detected if omitted                        |
| `BRIGHT_HOSTNAME`   | No       | API hostname. Default: `app.brightsec.com`                  |

#### AI / Inference

| Variable                 | Required | Description                                                                                                                                                                                              |
| ------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_MODEL`               | No       | Model name or comma-separated escalation chain. Single model stays fixed; multiple models auto-escalate on retry (e.g. `gpt-4.1-mini,gpt-4.1,o3` or `gpt-5.4-mini,gpt-5.3-codex`). Default: `gpt-5.4-mini` |
| `AI_REASONING_EFFORT`    | No       | Reasoning effort for thinking models (`o*`, `gpt-5*`, `*codex*`, `gpt-oss*`): `low`, `medium`, `high`, or `none`. Default: `medium` for detected reasoning models; ignored for regular chat models        |
| `GITHUB_INFERENCE_URL`   | No       | Inference API base URL. Supports OpenAI (`https://api.openai.com/v1`), GitHub Models (`https://models.github.ai/inference`), and Ollama (`http://localhost:11434`). Default: `https://api.openai.com/v1` |
| `OPENAI_API_KEY`         | Varies   | API key for OpenAI. Takes priority over other token vars                                                                                                                                                 |
| `GITHUB_INFERENCE_TOKEN` | Varies   | Inference token for GitHub Models. Fallback after `OPENAI_API_KEY`                                                                                                                                       |
| `GITHUB_TOKEN`           | Varies   | GitHub PAT. Used for git operations and as inference token fallback. At least one of `OPENAI_API_KEY`, `GITHUB_INFERENCE_TOKEN`, or `GITHUB_TOKEN` must be set                                           |
| `INFERENCE_PROVIDER`     | No       | Force provider: `openai`, `github-models`, or `ollama`. Auto-detected from URL if omitted                                                                                                                |

#### GitHub / Git

| Variable            | Required | Description                                                              |
| ------------------- | -------- | ------------------------------------------------------------------------ |
| `GITHUB_TOKEN`      | **Yes**  | GitHub PAT for cloning repos and creating PRs                            |
| `GITHUB_GIT_TOKEN`  | No       | Dedicated git clone token. Falls back to `GIT_TOKEN` then `GITHUB_TOKEN` |
| `GITHUB_REPOSITORY` | No       | Target repository in `owner/repo` format. Falls back to `REPO` env var   |
| `GITHUB_SERVER_URL` | No       | GitHub server URL (default: `https://github.com`)                        |
| `GITHUB_BRANCH`     | No       | Branch name for fixes (default: `bright-scan-<timestamp>`)               |
| `GIT_AUTHOR_NAME`   | No       | Git commit author name (default: `BrightSec`)                            |
| `GIT_AUTHOR_EMAIL`  | No       | Git commit author email (default: `bot@brightsec.com`)                   |

#### Copilot Engine (CI/CD only — set automatically by engine-cli)

| Variable                    | Required | Description                         |
| --------------------------- | -------- | ----------------------------------- |
| `GITHUB_JOB_ID`             | No       | Job ID from Copilot Engine platform |
| `GITHUB_PLATFORM_API_TOKEN` | No       | Platform API token                  |
| `GITHUB_PLATFORM_API_URL`   | No       | Platform API URL                    |
| `GITHUB_JOB_NONCE`          | No       | Optional job nonce                  |

#### Run Mode

| Variable   | Required | Description                                                                                                                                                 |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RUN_MODE` | No       | `full` (default) — start the full application and scan. `function` — skip full startup, wrap critical functions in a lightweight HTTP harness and scan those |

In `full` mode, if startup or auth fails, the engine automatically falls back to function harness mode.

#### Standalone Mode

| Variable            | Required | Description                                                                  |
| ------------------- | -------- | ---------------------------------------------------------------------------- |
| `PROBLEM_STATEMENT` | No       | Problem description (default: `Run a security scan and fix vulnerabilities`) |
| `ACTION`            | No       | Action to perform (default: `fix`)                                           |

#### Provider Examples

**OpenAI (default):**

```bash
export OPENAI_API_KEY="sk-..."
export AI_MODEL="gpt-4.1-mini"
```

**GitHub Models:**

```bash
export GITHUB_INFERENCE_URL="https://models.github.ai/inference"
export GITHUB_TOKEN="ghp_..."
export AI_MODEL="openai/gpt-4.1-mini"
```

**Ollama (local):**

```bash
export GITHUB_INFERENCE_URL="http://localhost:11434"
export AI_MODEL="llama4:latest"
```

**Escalating models (auto-upgrade on failure):**

```bash
export AI_MODEL="gpt-4.1-mini,gpt-4.1,o3"
```

**Reasoning / Codex models:**

```bash
export AI_MODEL="gpt-5.4-mini,gpt-5.3-codex"
export AI_REASONING_EFFORT="high"
```

### System Requirements

- **Node.js**: ≥20.0.0
- **Repository**: Must be cloned by engine or available locally
- **Application**: Must be startable via npm/pip/etc. and expose HTTP server
- **Bright Account**: At least one project created at [app.brightsec.com](https://app.brightsec.com)

## Installation

```bash
npm install
```

## Building

```bash
npm run build
npm run typecheck
```

## Running

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
node dist/index.js
```

## How It Works

### LLM-Driven Analysis

The engine minimizes LLM usage by doing as much as possible programmatically:

- **Tech stack detection** — Fully deterministic: reads `package.json`, `.csproj`, `go.mod`, `Cargo.toml`, `composer.json`, etc.
- **Controller discovery** — Glob patterns for all major frameworks (Express, ASP.NET, Spring, Flask, Rails, Gin, Laravel)
- **Endpoint extraction** — Regex parsing of route decorators/registrations per language
- **Query params** — Regex extraction from `[FromQuery]`, `req.query.*`, etc.
- **Request body analysis** — **LLM-only** for POST/PUT/PATCH endpoints (receives a small code snippet, can request more via `read_lines` and `find_type` tools)
- **Path param values** — **LLM-only** for endpoints with `:id`, `{slug}` etc.

- **Tools provided to LLM**:
  - `read_file(path)` — Read file contents
  - `list_files(pattern)` — Glob pattern matching
  - `search_files(query)` — Text search via grep
  - `read_lines(file, start, end)` — Read specific line range
  - `find_type(type_name)` — Search for class/interface/DTO definitions
  - Where vulnerabilities are introduced in code
  - How to patch vulnerable code

### Bright Integration

The agent connects to Bright via Model Context Protocol (MCP) to:

- Create/manage repeaters for scanning private apps
- Add HTTP entrypoints to scan
- Configure authentication for protected endpoints
- Run DAST security scans with 18+ vulnerability tests
- Retrieve scan results and findings

## Security Tests

Tests are selected **per-endpoint** by the LLM based on the endpoint's technology, parameters, and purpose. Available tests include:

```
sqli, xss, stored_xss, ssrf, osi, lfi, ssti, xxe, open_redirect, nosql,
header_security, cookie_security, csrf, jwt, proto_pollution, secret_tokens,
directory_listing, insecure_tls, prompt_injection, bola, bopla, mass_assignment,
brute_force_login, broken_access_control, excessive_data_exposure, and more
```

Auth-dependent tests (BAC, BOLA, brute force, etc.) are automatically excluded when no auth is configured.

See `phases/test-selection.ts` for the selection logic.

## Example Output

```
[Engine] Bright Security Copilot Engine starting...
[Engine] Job: abc123, action: scan-and-fix
[Engine] Repository: github.com/user/app

[Analyze] Detected: Node.js, Express, MongoDB
[Analyze] Found 12 HTTP endpoints

[Startup] Starting application: npm start (port 3000)
[App] Server listening on port 3000

[Setup] Repeater connected: repeater-xyz123

[Auth] Detected auth: jwt — Requires Authorization header with Bearer token

[Entrypoints] Registered 12 entrypoints

[Scan] Running security scan (pass 1/5)
[Scan] Status: running — 2 issues found so far
[Scan] Completed: done (5 issues)

[Fix] Analyzing: SQL Injection at POST /api/users
[Fix] Generated fix: Added input validation and parameterized queries
[Fix] Applied 5 fixes

[Scan] Running security scan (pass 2/5)
[Scan] Completed: done (0 issues)

[Done] All vulnerabilities resolved. 5 total fixes applied.
```

## Local Testing with copilot-engine-sdk CLI

The engine can be tested locally using the [`engine-cli`](https://github.com/github/copilot-engine-sdk#cli--local-testing) tool, which simulates the full platform API:

```bash
# 1. Build the engine
npm run build

# 2. Clone the SDK and build the CLI (requires Go)
git clone https://github.com/github/copilot-engine-sdk.git
cd copilot-engine-sdk/cli
go build ./cmd/engine-cli

# 3. Run the engine against a target repo
cd /path/to/bright-agent

GITHUB_TOKEN="your-github-pat" \
BRIGHT_TOKEN="your-bright-api-token" \
GITHUB_INFERENCE_URL="https://api.openai.com/v1" \
OPENAI_API_KEY="your-openai-key" \
AI_MODEL="gpt-4.1-mini" \
./path/to/engine-cli run "node dist/index.js" \
  --repo https://github.com/owner/target-repo \
  --problem-statement "Run a security scan and fix vulnerabilities" \
  --action fix \
  --timeout 120m \
  --engine-logs \
  --verbose
```

The CLI will:

- Clone the target repository to a temp directory
- Start a mock HTTP server that mimics the platform API
- Spawn the engine with all required environment variables (`GITHUB_JOB_ID`, `GITHUB_PLATFORM_API_TOKEN`, etc.)
- Display progress events in formatted output

Run `./engine-cli run --help` for all available options.

## File Structure

- **Source**: `src/` — TypeScript source (phases, prompts, utilities)
- **Distribution**: `dist/` — Compiled JavaScript & types
- **Configuration**: `tsconfig.json`, `tsup.config.ts`
- **Dependencies**: Listed in `package.json`

## Key Features

✅ **Automated Discovery** — Finds HTTP endpoints via code analysis + Swagger/OpenAPI specs
✅ **Auth Detection** — Auto-detects JWT, API keys, sessions, OAuth with multistep login flows
✅ **Per-Endpoint Test Selection** — LLM selects relevant security tests per endpoint
✅ **Local Execution** — Starts your app locally for realistic scanning
✅ **Function Harness Mode** — Falls back to wrapping critical functions when full startup fails
✅ **Repeater Integration** — Supports private/internal networks, auto-cleanup on exit
✅ **Multi-pass Validation** — Up to 5 iterations of scan → fix → validate
✅ **Fix Recovery** — Detects when fixes break the app, repairs or reverts automatically
✅ **LLM-Driven Fixes** — Contextual patches with taint analysis via configurable models
✅ **Model Escalation** — Auto-upgrades to stronger models on failure (e.g. `gpt-5.4-mini,gpt-5.4`)
✅ **GitHub Integration** — Reports progress via Copilot Engine API

## Troubleshooting

### Scan Status Stuck on "running"

Check Bright dashboard at [app.brightsec.com](https://app.brightsec.com). The 30-minute timeout may be exceeded for complex scans.

### Application Won't Start

The engine will automatically fall back to **function harness mode** when startup fails. If you want to skip startup entirely, set `RUN_MODE=function`.

To debug startup issues:

- Check `startup.ts` LLM output for detected startup command
- Manually verify `npm start` or equivalent works in the cloned repo
- If the app breaks after a fix is applied, the engine will capture Docker container logs, attempt a repair, or revert the fix commit automatically

### Auth Detection Failed

If the LLM can't detect auth, the engine will fall back to **function harness mode** (scanning without auth). You can also manually configure auth in Bright dashboard before running the scan. The engine uses Bright's **multistep** auth type with NexTemplate interpolation — avoid the simpler "header" type for login-based auth.

### Entrypoint Conflicts

When re-running against the same project, existing entrypoints are detected and reused (conflict handling). No manual cleanup needed.

### No HTTP Endpoints Found

The LLM may have failed to locate controller files. Check `analyze.ts` for detected files and manually add endpoints via Bright dashboard if needed.

## License

MIT

## References

- [Bright API Documentation](https://docs.brightsec.com)
- [GitHub Copilot Engine SDK](https://github.com/github/copilot-engine-sdk)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [OpenAI API](https://platform.openai.com)
