# Bright Security Copilot Engine

A GitHub Copilot Engine that performs automated security scanning and remediation using [Bright](https://www.brightsec.com/) DAST (Dynamic Application Security Testing). This agent analyzes your codebase, discovers HTTP endpoints, runs security scans, and automatically generates and applies fixes for vulnerabilities.

## Overview

This engine integrates with:
- **GitHub Copilot Engine SDK** (`@github/copilot-engine-sdk`) for orchestration and CI/CD integration
- **Bright MCP Server** for security scanning capabilities
- **OpenAI/Claude API** for LLM-driven code analysis and fix generation

The workflow follows an 8-step scan-fix-validate loop, repeating up to 5 passes until vulnerabilities are resolved or max iterations reached.

## Architecture

### Core Components

```
src/
├── index.ts                  # Entry point
├── orchestrator.ts           # Main 8-step workflow
├── mcp-client.ts            # Bright API wrapper
├── inference.ts             # LLM chat utilities
├── tools.ts                 # Codebase analysis tools (read, list, search)
├── config.ts                # Configuration loading
├── progress.ts              # GitHub Engine progress reporter
├── utils.ts                 # Shared utilities (sleep, formatTechStack, toErrorMessage)
├── types.ts                 # TypeScript interfaces
│
├── phases/                  # Workflow phases
│   ├── analyze.ts          # 1. Tech stack & endpoint discovery
│   ├── startup.ts          # 2. Start application locally
│   ├── repeater.ts         # 3. Bright Repeater setup
│   ├── auth.ts             # 4. Auth detection & configuration
│   ├── entrypoints.ts      # 5. Register endpoints with Bright
│   ├── scan.ts             # 6. Run security scan
│   ├── findings.ts         # 7. Fetch vulnerability findings
│   └── fix.ts              # 8. Generate & apply fixes
│
└── prompts/                # LLM prompts & schemas
    ├── detect-tech-stack.ts
    ├── discover-endpoints.ts
    ├── identify-startup.ts
    ├── detect-auth.ts
    └── generate-fix.ts
```

## Workflow

The orchestrator executes the following 8-step workflow, repeating steps 6–8 up to 5 times:

### Phase 1: Analyze Repository
- **Component**: `phases/analyze.ts`
- Detects tech stack (languages, frameworks, databases) from config files
- Discovers HTTP endpoints by analyzing route controllers
- Enriches endpoints with method signatures, parameters, headers, and body formats
- **Output**: List of `DiscoveredEndpoint` objects

### Phase 2: Start Application
- **Component**: `phases/startup.ts`
- Analyzes startup config (scripts, env vars, prerequisites, Docker)
- Runs prerequisites (npm install, pip install, etc.)
- Spawns the application process and waits for it to become ready
- **Output**: Application running on localhost

### Phase 3: Setup Repeater
- **Component**: `phases/repeater.ts`
- Creates a Bright Repeater (local proxy for scanning private/internal apps)
- Registers the repeater with Bright cloud service
- **Output**: Active repeater connection

### Phase 4: Detect & Configure Authentication
- **Component**: `phases/auth.ts`
- Analyzes codebase for auth mechanisms (JWT, API keys, sessions, OAuth)
- Determines login endpoints and token extraction logic
- Registers auth configuration with Bright (multistep or header-based)
- **Output**: Auth object ID for use in scans

### Phase 5: Register Entrypoints
- **Component**: `phases/entrypoints.ts`
- Registers discovered endpoints with Bright project
- Associates repeater and auth (if applicable) with each entrypoint
- **Output**: List of entrypoint IDs ready for scanning

### Phase 6: Run Security Scan
- **Component**: `phases/scan.ts`
- Initiates Bright scan with 18+ security tests (SQL injection, XSS, CSRF, etc.)
- Polls scan status until completion (up to 30 minutes)
- **Output**: Completed scan with vulnerabilities identified

### Phase 7: Fetch Findings
- **Component**: `phases/findings.ts`
- Retrieves critical/high/medium severity issues from completed scan
- Normalizes issue data for fix generation
- **Output**: List of `Finding` objects with vulnerability details

### Phase 8: Generate & Apply Fixes
- **Component**: `phases/fix.ts`
- For each finding, performs taint analysis to identify vulnerable code paths
- Generates fixes using LLM with context of affected files
- Applies fixes to repository and commits changes
- Restarts application for re-validation

### Loop Strategy
- **Iterations**: Up to 5 passes (phases 6-8)
- **Early exit**:
  - No vulnerabilities found → exit successfully
  - Scan fails → exit with error
  - Max iterations reached → exit with remaining vulnerabilities reported

## Prerequisites

### Environment Variables

```bash
# GitHub Copilot Engine (required in CI/CD)
export GITHUB_JOB_ID=<job-id>
export GITHUB_PLATFORM_API_TOKEN=<api-token>
export GITHUB_PLATFORM_API_URL=<api-url>
export GITHUB_JOB_NONCE=<optional-nonce>
export GITHUB_GIT_TOKEN=<git-token>
export GITHUB_INFERENCE_URL=<inference-url>      # Optional
export GITHUB_INFERENCE_TOKEN=<inference-token>  # Optional

# Bright (required)
export BRIGHT_TOKEN=<api-key-from-app.brightsec.com>
export BRIGHT_HOSTNAME=app.brightsec.com         # Optional, defaults to app.brightsec.com
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

The engine uses an LLM (OpenAI/Claude) with tool-calling to analyze the codebase:

- **Tools provided to LLM**:
  - `read_file(path)` — Read file contents
  - `list_files(pattern)` — Glob pattern matching
  - `search_files(query)` — Text search via grep

- **LLM makes decisions on**:
  - What tech stack and frameworks are in use
  - Where HTTP routes/controllers are defined
  - How authentication works
  - How to start the application
  - Where vulnerabilities are introduced in code
  - How to patch vulnerable code

### Bright Integration

The agent connects to Bright via Model Context Protocol (MCP) to:

- Create/manage repeaters for scanning private apps
- Add HTTP entrypoints to scan
- Configure authentication for protected endpoints
- Run DAST security scans with 18+ vulnerability tests
- Retrieve scan results and findings

## Default Security Tests

The engine runs the following Bright tests by default:

```
sqli, xss, stored_xss, ssrf, osi, lfi, ssti, xxe,
open_redirect, nosql, header_security, cookie_security,
csrf, jwt, proto_pollution, secret_tokens, directory_listing, insecure_tls
```

See `phases/scan.ts` for the full list.

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
./engine-cli run "node /path/to/bright-agent/dist/index.js" \
  --repo https://github.com/owner/target-repo \
  --problem-statement "Run a security scan and fix vulnerabilities" \
  --action fix \
  --timeout 30m \
  --env BRIGHT_TOKEN=your-bright-api-token \
  --env BRIGHT_HOSTNAME=app.brightsec.com
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

✅ **Automated Discovery** — Finds HTTP endpoints via code analysis
✅ **Auth Detection** — Auto-detects JWT, API keys, sessions, OAuth
✅ **Local Execution** — Starts your app locally for realistic scanning
✅ **Repeater Integration** — Supports private/internal networks
✅ **Multi-pass Validation** — Up to 5 iterations of scan → fix → validate
✅ **LLM-Driven Fixes** — Claude/GPT-4 generates contextual patches
✅ **GitHub Integration** — Reports progress via Copilot Engine API

## Troubleshooting

### Scan Status Stuck on "running"

Check Bright dashboard at [app.brightsec.com](https://app.brightsec.com). The 30-minute timeout may be exceeded for complex scans.

### Application Won't Start

Ensure prerequisites run correctly:
- Check `startup.ts` LLM output for detected startup command
- Manually verify `npm start` or equivalent works in the cloned repo

### Auth Detection Failed

If the LLM can't detect auth, you can manually configure it in Bright dashboard before running the scan.

### No HTTP Endpoints Found

The LLM may have failed to locate controller files. Check `analyze.ts` for detected files and manually add endpoints via Bright dashboard if needed.

## License

MIT

## References

- [Bright API Documentation](https://docs.brightsec.com)
- [GitHub Copilot Engine SDK](https://github.com/github/copilot-engine-sdk)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [OpenAI API](https://platform.openai.com)
