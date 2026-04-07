import {
  PlatformClient,
  cloneRepo,
  finalizeChanges,
} from "@github/copilot-engine-sdk";
import { loadConfig } from "./config.js";
import { createInferenceClient } from "./inference.js";
import { toErrorMessage } from "./utils.js";
import { createBrightMcpClient } from "./mcp-client.js";
import { runOrchestrator } from "./orchestrator.js";
import type { OrchestratorContext } from "./types.js";

async function main(): Promise<void> {
  // Patch console methods to prepend ISO timestamps
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  console.log = (...args: unknown[]) => origLog(new Date().toISOString(), ...args);
  console.warn = (...args: unknown[]) => origWarn(new Date().toISOString(), ...args);
  console.error = (...args: unknown[]) => origError(new Date().toISOString(), ...args);

  console.log("[Engine] Bright Security Copilot Engine starting...");

  // 1. Load configuration from environment
  const config = loadConfig();

  // 2. Initialize platform client
  const platform = new PlatformClient({
    apiUrl: config.apiUrl,
    jobId: config.jobId,
    token: config.apiToken,
    nonce: config.nonce,
  });

  // 3. Fetch job details
  const job = await platform.fetchJobDetails();
  console.log(`[Engine] Job: ${job.ID}, action: ${job.action}`);
  console.log(`[Engine] Repository: ${job.repository}`);
  console.log(`[Engine] Problem: ${job.problem_statement.content.slice(0, 200)}`);

  // 4. Clone the repository
  const repoPath = cloneRepo({
    serverUrl: job.server_url,
    repository: job.repository,
    gitToken: process.env.GITHUB_GIT_TOKEN ?? "",
    branchName: job.branch_name,
    commitLogin: job.commit_login,
    commitEmail: job.commit_email,
  });
  console.log(`[Engine] Cloned to: ${repoPath}`);

  // 5. Initialize inference client (OpenAI-compatible)
  // OPENAI_API_KEY takes precedence for local testing, since
  // engine-cli overrides GITHUB_INFERENCE_TOKEN with the GitHub PAT.
  const inferenceUrl =
    process.env.GITHUB_INFERENCE_URL ?? config.apiUrl;
  const inferenceToken =
    process.env.OPENAI_API_KEY ??
    process.env.GITHUB_INFERENCE_TOKEN ??
    config.apiToken;
  const llm = createInferenceClient(inferenceUrl, inferenceToken);

  // 6. Connect to Bright MCP
  const bright = await createBrightMcpClient(config);
  console.log("[Engine] Connected to Bright MCP server");

  // 7. Run the orchestrator
  const ctx: OrchestratorContext = {
    repoPath,
    platform,
    llm,
    bright,
    config,
  };

  try {
    await runOrchestrator(ctx);
  } catch (err) {
    const msg = toErrorMessage(err);
    console.error(`[Engine] Orchestrator failed: ${msg}`);

    await platform.sendAssistantMessage({
      turn: 999,
      callId: "error",
      content: `Security scan failed: ${msg}`,
      toolCalls: [],
    });
  }

  // 8. Finalize - commit and push any remaining changes
  finalizeChanges(repoPath, "fix: Bright security scan remediations");
  console.log("[Engine] Done.");
}

main().catch((err) => {
  console.error("[Engine] Fatal error:", err);
  process.exit(1);
});
