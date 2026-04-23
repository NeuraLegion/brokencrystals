import type OpenAI from "openai";
import type { ChatCompletionTool, ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";
import { execSync } from "child_process";
import { chatWithTools, type ToolHandler } from "../inference.js";
import {
  codebaseTools,
  createToolHandler,
  webSearchTools,
  createWebSearchHandler,
} from "../tools.js";
import { extractJson, runShellCommand, formatTechStack } from "../utils.js";
import { firstRunSetupPrompt } from "../prompts/setup.js";
import type { TechStack, StartupConfig } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FirstRunSetupResult {
  /** True if setup was completed (or was already done). */
  completed: boolean;
  /** Admin credentials created during setup (if any). */
  credentials?: {
    username: string;
    password: string;
    email: string;
  };
  /** Brief description of what happened. */
  summary: string;
}

/** Captured evidence from a single report_setup_evidence call. */
interface SetupEvidence {
  command: string;
  output: string;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Detection: does this app need first-run setup?
// ---------------------------------------------------------------------------

/**
 * Heuristic check: does this app need first-run setup?
 * Uses healthCheckSummary and postStartSetup hints from discovery.
 * Also probes a few well-known setup URLs as a last resort.
 * Returns true if the app appears to be in first-run / install-wizard state.
 */
export async function detectFirstRunSetup(
  baseUrl: string,
  startupConfig: StartupConfig,
  postStartSetupHints?: string[],
): Promise<boolean> {
  // 1. Check if discovery explicitly reported post-start setup steps
  if (postStartSetupHints && postStartSetupHints.length > 0) {
    const combined = postStartSetupHints.join(" ").toLowerCase();
    if (
      combined.includes("wizard") ||
      combined.includes("install") ||
      combined.includes("setup") ||
      combined.includes("first-run") ||
      combined.includes("register admin") ||
      combined.includes("initial config")
    ) {
      console.log("[Setup] Discovery hints indicate first-run setup needed");
      return true;
    }
  }

  // 2. Check healthCheckSummary for setup-wizard keywords
  const summary = (startupConfig.healthCheckSummary ?? "").toLowerCase();
  const setupKeywords = [
    "setup wizard",
    "install wizard",
    "installation wizard",
    "finish installation",
    "first-run",
    "first run",
    "initial setup",
    "configure your",
    "register an admin",
    "create an admin",
    "setup page",
    "install page",
  ];
  if (setupKeywords.some((kw) => summary.match(new RegExp(kw, "i")))) {
    console.log("[Setup] Health check summary indicates first-run setup needed");
    return true;
  }

  // 3. Probe well-known setup URLs — only generic paths that are near-universal
  //    Framework-specific paths are the LLM's job to discover, not hardcoded here
  const specificSetupPaths = [
    { path: "/install", match: /(?:step|wizard|database|admin|password|configuration)/i },
    { path: "/setup", match: /(?:step|wizard|database|admin|password|configuration)/i },
    { path: "/finish-installation", match: /(?:register|admin|install)/i },
  ];

  for (const { path, match } of specificSetupPaths) {
    try {
      const resp = await fetch(`${baseUrl}${path}`, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });
      if (resp.status === 200) {
        const body = await resp.text();
        if (match.test(body)) {
          console.log(`[Setup] Found setup page at ${path}`);
          return true;
        }
      }
    } catch {
      // Network error — skip
    }
  }

  // 4. Check if root redirects to a setup/install path
  try {
    const rootResp = await fetch(baseUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    });
    if (rootResp.status >= 300 && rootResp.status < 400) {
      const location = (rootResp.headers.get("location") ?? "").toLowerCase();
      if (
        location.includes("/install") ||
        location.includes("/setup") ||
        location.includes("/wizard") ||
        location.includes("/finish-installation")
      ) {
        console.log(`[Setup] Root redirects to setup: ${location}`);
        return true;
      }
    }
  } catch {
    // Ignore
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main: complete first-run setup via LLM
// ---------------------------------------------------------------------------

export async function completeFirstRunSetup(
  llm: OpenAI,
  repoPath: string,
  baseUrl: string,
  techStack: TechStack,
  startupConfig: StartupConfig,
  postStartSetupHints: string[],
  model?: string,
  criticModel?: string,
): Promise<FirstRunSetupResult> {
  console.log("[Setup] Starting first-run setup phase...");

  // Build tool set — same as auth seed/repair (host commands, docker, probe, codebase, web)
  const setupTools: ChatCompletionTool[] = [
    ...codebaseTools,
    ...webSearchTools,
    {
      type: "function",
      function: {
        name: "run_command_on_host",
        description:
          "Run a shell command on the HOST machine. Use for docker ps, docker logs, curl, and host-level diagnostics. Timeout: 120 seconds.",
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: 'Host shell command (e.g. "docker ps --format \'{{.ID}} {{.Image}}\'")',
            },
          },
          required: ["command"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "run_command_in_docker",
        description:
          "Run a command INSIDE a Docker container. Use to run migrations, CLI setup, etc. Timeout: 120 seconds.",
        parameters: {
          type: "object",
          properties: {
            container: {
              type: "string",
              description: 'Container name or ID',
            },
            command: {
              type: "string",
              description: 'Command to run inside the container',
            },
          },
          required: ["container", "command"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "probe_url",
        description:
          "Make an HTTP request to the running app. Cookies are tracked across calls within this session. Use to interact with setup wizards.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "Full URL to probe" },
            method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"], description: "HTTP method. Default: GET" },
            headers: { type: "string", description: 'JSON headers, e.g. \'{"Content-Type":"application/json"}\'' },
            body: { type: "string", description: "Request body for POST/PUT" },
          },
          required: ["url"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "report_setup_evidence",
        description:
          "REQUIRED before claiming setup is complete. Report concrete evidence proving setup succeeded. " +
          "Provide the EXACT verification command/probe you ran, the RAW output you captured (paste actual response, not a summary), " +
          "and a short explanation of why this output proves setup is done. May be called multiple times to accumulate evidence.",
        parameters: {
          type: "object",
          properties: {
            verification_command: {
              type: "string",
              description: "The exact command, SQL query, or HTTP probe used to verify setup (e.g. \"sqlcmd -Q 'SELECT count(*) FROM umbracoUser'\" or \"POST /umbraco/management/api/v1/security/back-office/login\")",
            },
            verification_output: {
              type: "string",
              description: "The raw, unmodified output captured from the verification command. Paste the actual response/result, not a summary.",
            },
            why_this_proves_setup_complete: {
              type: "string",
              description: "Short explanation of why this specific output proves the setup achieved its goal (schema created, admin user exists, etc.)",
            },
          },
          required: ["verification_command", "verification_output", "why_this_proves_setup_complete"],
          additionalProperties: false,
        },
      },
    },
  ];

  // Build tool handler
  const baseCodeHandler = createToolHandler(repoPath);
  const webHandler = createWebSearchHandler(repoPath);

  // Track cookies across probe_url calls for wizard multi-step flows
  const cookieJar: Record<string, string> = {};

  // Track evidence reported by the LLM
  const collectedEvidence: SetupEvidence[] = [];

  const handler: ToolHandler = async (name, args) => {
    if (name === "run_command_on_host") {
      const cmd = String(args.command ?? "");
      console.log(`[Setup] run_command_on_host: ${cmd.slice(0, 200)}`);
      return runShellCommand(repoPath, cmd, 120_000);
    }
    if (name === "run_command_in_docker") {
      const container = String(args.container ?? "");
      const cmd = String(args.command ?? "");
      console.log(`[Setup] run_command_in_docker [${container}]: ${cmd.slice(0, 200)}`);
      const isRunning = (() => {
        try {
          const out = execSync(
            `docker inspect --format='{{.State.Running}}' ${JSON.stringify(container)} 2>/dev/null`,
            { encoding: "utf-8", timeout: 5_000 },
          ).trim();
          return out === "true";
        } catch {
          return false;
        }
      })();
      const dockerCmd = isRunning
        ? `docker exec ${JSON.stringify(container)} sh -c ${JSON.stringify(cmd)}`
        : `docker run --rm ${JSON.stringify(container)} sh -c ${JSON.stringify(cmd)}`;
      return runShellCommand(repoPath, dockerCmd, 120_000);
    }
    if (name === "probe_url") {
      return probeUrlWithCookies(args, cookieJar);
    }
    if (name === "report_setup_evidence") {
      const command = String(args.verification_command ?? "").trim();
      const output = String(args.verification_output ?? "").trim();
      const reasoning = String(args.why_this_proves_setup_complete ?? "").trim();
      // Reject obviously-empty / placeholder evidence so the LLM tries again
      if (command.length < 3 || output.length < 3 || reasoning.length < 5) {
        return "Evidence rejected: each field must contain real content. Re-run a verification command and paste actual output.";
      }
      collectedEvidence.push({ command, output, reasoning });
      console.log(`[Setup] Evidence #${collectedEvidence.length} recorded: ${command.slice(0, 120)}`);
      return `Evidence recorded (${collectedEvidence.length} total). You may report more evidence or proceed to the final JSON answer.`;
    }
    if (name === "search_web" || name === "fetch_url") {
      return webHandler(name, args);
    }
    return baseCodeHandler(name, args);
  };

  const messages = firstRunSetupPrompt(
    baseUrl,
    formatTechStack(techStack),
    startupConfig.healthCheckSummary ?? "N/A",
    postStartSetupHints,
  );

  const response = await chatWithTools(llm, messages, setupTools, handler, model, 30);

  try {
    const json = extractJson(response);
    const result = JSON.parse(json) as {
      completed: boolean;
      alreadySetUp?: boolean;
      username?: string;
      password?: string;
      email?: string;
      summary?: string;
      reason?: string;
    };

    if (result.completed) {
      // Gate 1: Evidence required
      if (collectedEvidence.length === 0) {
        console.warn("[Setup] LLM claimed completed=true but provided NO evidence — rejecting");
        return {
          completed: false,
          summary: "LLM claimed setup complete but failed to call report_setup_evidence with proof",
        };
      }

      // Gate 2: Critic pass with escalated model
      const critic = await runEvidenceCritic(
        llm,
        baseUrl,
        techStack,
        result.alreadySetUp === true,
        collectedEvidence,
        criticModel ?? model,
      );
      if (!critic.convincing) {
        console.warn(`[Setup] Critic rejected evidence: ${critic.reason}`);
        return {
          completed: false,
          summary: `Evidence rejected by critic: ${critic.reason}`,
        };
      }
      console.log(`[Setup] Critic accepted evidence: ${critic.reason.slice(0, 160)}`);

      // Gate 3: Existing safety net — re-probe for installer endpoints if "alreadySetUp"
      if (result.alreadySetUp) {
        const stillInSetup = await verifyStillInSetupMode(baseUrl);
        if (stillInSetup) {
          console.warn("[Setup] LLM claimed app is set up, but installer endpoints still respond — treating as incomplete");
          return { completed: false, summary: "LLM claimed already set up but installer endpoints are still active" };
        }
      }

      const summary = result.summary ?? (result.alreadySetUp ? "Already set up" : "Setup completed");
      console.log(`[Setup] First-run setup completed: ${summary}`);

      // Return credentials if the setup created an admin
      const credentials = result.username && result.password
        ? { username: result.username, password: result.password, email: result.email ?? "bright@test.com" }
        : undefined;

      return { completed: true, credentials, summary };
    }

    console.warn(`[Setup] First-run setup failed: ${result.reason ?? "unknown"}`);
    return { completed: false, summary: result.reason ?? "Setup failed" };
  } catch {
    console.warn(`[Setup] Could not parse setup result: ${response.slice(0, 200)}`);
    return { completed: false, summary: "Failed to parse LLM response" };
  }
}

// ---------------------------------------------------------------------------
// Critic pass — independent LLM call evaluates if evidence proves setup done
// ---------------------------------------------------------------------------

async function runEvidenceCritic(
  llm: OpenAI,
  baseUrl: string,
  techStack: TechStack,
  alreadySetUpClaim: boolean,
  evidence: SetupEvidence[],
  criticModel?: string,
): Promise<{ convincing: boolean; reason: string }> {
  const evidenceBlock = evidence
    .map((e, i) =>
      `### Evidence #${i + 1}\n` +
      `Command/probe: \`${e.command}\`\n` +
      `Raw output:\n\`\`\`\n${e.output.slice(0, 3000)}\n\`\`\`\n` +
      `Agent's reasoning: ${e.reasoning}`,
    )
    .join("\n\n");

  const claim = alreadySetUpClaim
    ? "the app was ALREADY set up (no wizard needed) — schema and admin user existed before this phase started"
    : "the app's first-run setup has been COMPLETED — the database schema now exists and the admin user has been created";

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        `You are a strict reviewer evaluating whether a setup agent's claim is supported by concrete evidence. ` +
        `Your job is to detect hallucinated success — cases where the agent claims completion without real proof.\n\n` +
        `## Context\n` +
        `- App URL: ${baseUrl}\n` +
        `- Tech stack: ${formatTechStack(techStack)}\n` +
        `- Agent claims: ${claim}\n\n` +
        `## What counts as convincing evidence\n` +
        `- A SQL query whose output shows actual rows from a setup-created table (e.g. \`SELECT * FROM users LIMIT 5\` returning real rows)\n` +
        `- A successful authenticated API call that ONLY works after setup (e.g. login returns 200 + a token, not 401)\n` +
        `- A health/status endpoint explicitly reporting "configured" / "ready" / "installed"\n` +
        `- A direct check confirming database tables exist (e.g. \`information_schema\` query returning the expected table)\n\n` +
        `## What is NOT convincing\n` +
        `- The root URL returns HTTP 200 (modern SPAs return 200 in both setup and post-setup states)\n` +
        `- A command that just prints "done" or "ok" without actually checking anything\n` +
        `- A grep/search of source code (proves nothing about runtime state)\n` +
        `- An HTTP 200 from any page that doesn't require setup-specific data\n` +
        `- Reasoning that says "the logs probably show..." without actual log content\n` +
        `- Empty/short output that doesn't actually demonstrate the claim\n\n` +
        `## Your task\n` +
        `Examine each piece of evidence. Decide if the COMBINED evidence convincingly proves the agent's claim. ` +
        `Be strict — when in doubt, reject. False positives here cause cascading failures downstream.\n\n` +
        `Reply with ONLY this JSON (no prose, no markdown fence):\n` +
        `{"convincing": true|false, "reason": "1-2 sentence justification"}`,
    },
    {
      role: "user",
      content: `## Evidence collected\n\n${evidenceBlock}\n\nIs this evidence convincing? Reply with the JSON verdict.`,
    },
  ];

  try {
    const response = await chatWithTools(llm, messages, [], async () => "", criticModel, 1);
    const json = extractJson(response);
    const verdict = JSON.parse(json) as { convincing?: boolean; reason?: string };
    return {
      convincing: verdict.convincing === true,
      reason: verdict.reason ?? "(no reason provided)",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Setup] Critic call failed: ${msg} — defaulting to REJECT`);
    return {
      convincing: false,
      reason: `Critic evaluation failed: ${msg}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Post-completion verification: is the app still in setup mode?
// ---------------------------------------------------------------------------

/**
 * Quick sanity check after LLM claims "already set up". Probes the base URL
 * and checks container logs for signs the app is still in setup/install mode.
 * Returns true if evidence of active setup is found.
 */
async function verifyStillInSetupMode(baseUrl: string): Promise<boolean> {
  // Check if root page or common paths contain setup/install indicators
  for (const path of ["", "/admin", "/login"]) {
    try {
      const resp = await fetch(`${baseUrl}${path}`, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(5_000),
      });
      if (resp.status === 200) {
        const body = await resp.text();
        // Look for strong setup indicators in the page content
        if (/(?:install(?:er|ation)|setup.wizard|first.run|finish.installation|create.*admin.*account)/i.test(body)) {
          // But avoid false positives on pages that merely mention "install" in docs/text
          const url = resp.url.toLowerCase();
          if (/install|setup|wizard/.test(url)) {
            console.log(`[Setup] App appears to still be in setup mode (redirected to ${resp.url})`);
            return true;
          }
        }
      }
    } catch {
      // Skip
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Cookie-aware probe for multi-step setup wizards
// ---------------------------------------------------------------------------

async function probeUrlWithCookies(
  args: Record<string, unknown>,
  cookieJar: Record<string, string>,
): Promise<string> {
  const url = String(args.url ?? "");
  const method = String(args.method ?? "GET").toUpperCase();
  const body = args.body ? String(args.body) : undefined;

  let headers: Record<string, string> = {};
  if (args.headers) {
    try {
      headers = JSON.parse(String(args.headers));
    } catch {
      // Ignore parse errors
    }
  }

  // Inject accumulated cookies
  const cookieStr = Object.entries(cookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  if (cookieStr) {
    headers["Cookie"] = cookieStr;
  }

  console.log(`[Setup] probe_url: ${method} ${url}`);

  try {
    const resp = await fetch(url, {
      method,
      headers,
      body: method !== "GET" && method !== "HEAD" ? body : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });

    // Collect Set-Cookie headers
    const setCookies = resp.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const match = sc.match(/^([^=]+)=([^;]*)/);
      if (match) {
        cookieJar[match[1]] = match[2];
      }
    }

    const status = resp.status;
    const respHeaders: Record<string, string> = {};
    resp.headers.forEach((v, k) => {
      respHeaders[k] = v;
    });

    let respBody = "";
    try {
      respBody = await resp.text();
    } catch {
      respBody = "(could not read body)";
    }

    // Truncate large responses
    const maxLen = 8000;
    const truncated = respBody.length > maxLen
      ? respBody.slice(0, maxLen) + `\n... (truncated, ${respBody.length} bytes total)`
      : respBody;

    const headerSummary = Object.entries(respHeaders)
      .filter(([k]) => ["content-type", "location", "set-cookie", "x-csrf-token"].includes(k.toLowerCase()))
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    return `HTTP ${status}\n${headerSummary}\n\n${truncated}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[Setup] probe_url error: ${msg}`);
    return `Error: ${msg}`;
  }
}
