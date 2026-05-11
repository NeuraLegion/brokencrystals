import {
  createPlatform,
  cloneRepository,
  gitFinalizeChanges,
} from "./platform.js";
import { loadConfig } from "./config.js";
import { createInferenceClient, validateModelTiers } from "./inference.js";
import { verifyBrightAuth } from "./bright-api.js";
import { toErrorMessage } from "./utils.js";
import { runOrchestrator } from "./orchestrator.js";
import { detectScmProvider } from "./scm/index.js";
import type { OrchestratorContext } from "./types.js";

async function main(): Promise<void> {
  // Patch console methods to prepend ISO timestamps
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  const ts = () => new Date().toLocaleString("sv-SE", { hour12: false }).replace(" ", "T");
  console.log = (...args: unknown[]) =>
    origLog(ts(), ...args);
  console.warn = (...args: unknown[]) =>
    origWarn(ts(), ...args);
  console.error = (...args: unknown[]) =>
    origError(ts(), ...args);

  console.log("[Engine] Bright Security Copilot Engine starting...");

  // 1. Load configuration from environment
  const config = loadConfig();

  // 1b. Preflight: verify BRIGHT_TOKEN works against BRIGHT_HOSTNAME (fail fast)
  try {
    await verifyBrightAuth({
      brightToken: config.brightToken,
      brightHostname: config.brightHostname,
    });
    console.log(
      `[Engine] Bright credentials verified against ${config.brightHostname}`,
    );
  } catch (err) {
    console.error(`[Engine] Bright preflight failed: ${toErrorMessage(err)}`);
    process.exit(1);
  }

  // 2. Initialize platform (auto-detects GitHub / Azure DevOps from REPOSITORY_URL)
  const { platform, job } = await createPlatform(config.gitToken);
  console.log(`[Engine] Job: ${job.id}, action: ${job.action}`);
  console.log(`[Engine] Repository: ${job.repository}`);
  console.log(`[Engine] Problem: ${job.problemStatement.slice(0, 200)}`);

  // 3. Clone the repository
  const repositoryUrl = process.env.REPOSITORY_URL!;
  const { provider } = detectScmProvider(repositoryUrl);

  const repoPath = cloneRepository({
    provider,
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
    process.env.INFERENCE_TOKEN ??
    "";
  const llm = createInferenceClient(
    config.inferenceUrl,
    inferenceToken,
    config.inferenceProvider,
  );

  // 4b. Validate configured model tiers are available
  await validateModelTiers(llm, config.modelSelector, config.inferenceProvider);

  // 5. Run the orchestrator
  const ctx: OrchestratorContext = {
    repoPath,
    platform,
    llm,
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
