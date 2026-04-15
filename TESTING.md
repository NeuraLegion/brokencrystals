# Local Testing Guide

## Prerequisites

Ensure you have:

- Node.js ≥20.0.0
- npm or yarn
- A Bright account with at least one project at [app.brightsec.com](https://app.brightsec.com)
- The Copilot Engine SDK installed

## Step 1: Build the Engine

```bash
# Install dependencies
npm install

# Type-check the code
npm run typecheck

# Build the engine
npm run build

# Output: dist/ directory with compiled JavaScript
```

## Step 2: Set Up Environment Variables

Create a `.env` file in the project root:

```bash
# GitHub Copilot Engine (for local testing, these can be mock values)
export GITHUB_JOB_ID="test-job-123"
export GITHUB_PLATFORM_API_TOKEN="test-token"
export GITHUB_PLATFORM_API_URL="http://localhost:3000"
export GITHUB_JOB_NONCE="test-nonce"

# Bright (required - get from app.brightsec.com)
export BRIGHT_TOKEN="your-api-key-from-brightsec.com"
export BRIGHT_HOSTNAME="app.brightsec.com"

# Git tokens (for GitHub integration)
export GITHUB_GIT_TOKEN="ghp_xxx..."
```

## Step 3: Prepare a Test Repository

Clone or prepare a small web application to test with. Examples:

- [Express.js Hello World](https://github.com/expressjs/examples)
- [Flask Simple App](https://github.com/pallets/flask/tree/main/examples)
- Your own small web app

The engine will:

1. Analyze the codebase
2. Discover HTTP endpoints
3. Start the app locally
4. Run Bright security scans
5. Generate fixes for vulnerabilities

## Step 4: Test with Copilot Engine SDK CLI

The `@github/copilot-engine-sdk` package provides a CLI for local testing:

```bash
# Option 1: Using npx
npx @github/copilot-engine-sdk test \
  --engine ./dist/index.js \
  --repo /path/to/test-repo \
  --config your-test-config.json

# Option 2: Using installed CLI
npm install -g @github/copilot-engine-sdk
copilot-engine-sdk test \
  --engine ./dist/index.js \
  --repo /path/to/test-repo
```

See the [Copilot Engine SDK documentation](https://github.com/github/copilot-engine-sdk) for CLI options.

## Step 5: Monitor Progress

The engine logs progress to the console:

```
[Engine] Bright Security Copilot Engine starting...
[Engine] Job: test-job-123, action: scan-and-fix
[Engine] Cloned to: /tmp/repo-xyz

[Analyze] Detected: Node.js, Express
[Analyze] Found 8 HTTP endpoints
[Startup] Starting application: npm start (port 3000)
[Setup] Repeater connected: repeater-abc123
[Auth] Detected auth: jwt
[Entrypoints] Registered 8 entrypoints
...
```

## Troubleshooting

### Build Failures

Check for TypeScript errors:

```bash
npm run typecheck
```

### Missing Dependencies

Reinstall dependencies:

```bash
rm -rf node_modules package-lock.json
npm install
```

### Bright Connection Issues

- Verify `BRIGHT_TOKEN` is valid at [app.brightsec.com](https://app.brightsec.com)
- Check that the Bright hostname can be reached (default: `app.brightsec.com`)
- Ensure at least one Bright project exists

### Application Won't Start

- Check that the test repository's startup command is correct
- Verify prerequisites (npm install, etc.) run without errors
- Ensure the application exposes an HTTP server on the detected port

### No Vulnerabilities Found

This is expected for a simple "Hello World" app. Try with an application that has known vulnerabilities or add test endpoints.

## Next Steps

Once verified locally, deploy the engine in your CI/CD pipeline:

1. Build the Docker image or commit to your platform
2. Configure GitHub Copilot Engine as described in `@github/copilot-engine-sdk` documentation
3. Create a job that calls your engine
4. Monitor scans and remediation in the Bright dashboard

## Development Mode

For quick iteration during development:

```bash
npm run dev
```

This uses `tsx` to run TypeScript directly without building, but requires the same environment variables.
