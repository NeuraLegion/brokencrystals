import {
  createPlatform,
  cloneRepository,
  gitFinalizeChanges,
} from "./platform.js";
import { loadConfig } from "./config.js";
import { createInferenceClient, validateModelTiers } from "./inference.js";
import { toErrorMessage } from "./utils.js";
import { createBrightMcpClient } from "./mcp-client.js";
import { runOrchestrator } from "./orchestrator.js";
import type { OrchestratorContext } from "./types.js";

async function main(): Promise<void> {
  // Patch console methods to prepend ISO timestamps
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  console.log = (...args: unknown[]) =>
    origLog(new Date().toISOString(), ...args);
  console.warn = (...args: unknown[]) =>
    origWarn(new Date().toISOString(), ...args);
  console.error = (...args: unknown[]) =>
    origError(new Date().toISOString(), ...args);

  console.log("[Engine] Bright Security Copilot Engine starting...");

  // 1. Load configuration from environment
  const config = loadConfig();

  // 2. Initialize platform (GitHub SDK or standalone)
  const { platform, job } = await createPlatform(config.gitToken);
  console.log(`[Engine] Job: ${job.id}, action: ${job.action}`);
  console.log(`[Engine] Repository: ${job.repository}`);
  console.log(`[Engine] Problem: ${job.problemStatement.slice(0, 200)}`);

  // 3. Clone the repository
  const repoPath = cloneRepository({
    serverUrl: job.serverUrl,
    repository: job.repository,
    gitToken: config.gitToken,
    branchName: job.branchName,
    commitLogin: job.commitLogin,
    commitEmail: job.commitEmail,
  });
  console.log(`[Engine] Cloned to: ${repoPath}`);

  // 3b. Push branch and create PR for progress updates
  await platform.initPr(repoPath);

  // 4. Initialize inference client (OpenAI-compatible)
  const inferenceToken =
    process.env.OPENAI_API_KEY ??
    process.env.GITHUB_INFERENCE_TOKEN ??
    process.env.GITHUB_TOKEN ??
    "";
  const llm = createInferenceClient(
    config.inferenceUrl,
    inferenceToken,
    config.inferenceProvider,
  );

  // 4b. Validate configured model tiers are available
  await validateModelTiers(llm, config.modelSelector, config.inferenceProvider);

  // 5. Connect to Bright MCP
  const bright = await createBrightMcpClient(config);
  console.log("[Engine] Connected to Bright MCP server");

  // 6. Run the orchestrator
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

    await platform.reportError(`Security scan failed: ${msg}`);
  }

  // 7. Finalize - commit and push any remaining changes
  gitFinalizeChanges(repoPath, "fix: Bright security scan remediations");
  console.log("[Engine] Done.");
}

main().catch((err) => {
  console.error("[Engine] Fatal error:", err);
  process.exit(1);
});
