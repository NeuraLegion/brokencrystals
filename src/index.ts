import { verifyBrightAuth } from "./bright-api.js";
import { loadConfig } from "./config.js";
import { createInferenceClient, validateModelTiers } from "./inference.js";
import { logger } from "./logger.js";
import { runOrchestrator } from "./orchestrator.js";
import { cloneRepository, createPlatform, gitFinalizeChanges } from "./platform.js";
import { detectScmProvider } from "./scm/index.js";
import type { OrchestratorContext } from "./types.js";
import { toErrorMessage } from "./utils.js";

async function main(): Promise<void> {
  // Initialize logging: full detail (redacted) goes to a local log file; stdout
  // stays clean (milestones + errors) unless BRIGHT_DEBUG=1. All existing
  // console.* calls are routed to the log file.
  logger.init();
  logger.installConsoleRouting();

  logger.progress("Bright Agent starting…");
  const logPath = logger.logFilePath();
  if (logPath) logger.progress(`Detailed run log: ${logPath}`);

  // 1. Load configuration from environment
  const config = loadConfig();

  // 1b. Preflight: verify BRIGHT_TOKEN works against BRIGHT_HOSTNAME (fail fast)
  try {
    await verifyBrightAuth({
      brightToken: config.brightToken,
      brightHostname: config.brightHostname,
    });
    logger.progress(`Connected to Bright (${config.brightHostname}).`);
  } catch (err) {
    console.error(`[Engine] Bright preflight failed: ${toErrorMessage(err)}`);
    logger.error("Could not connect to Bright — check BRIGHT_TOKEN / BRIGHT_HOSTNAME.");
    process.exit(1);
  }

  // 2. Initialize platform (auto-detects GitHub / Azure DevOps from REPOSITORY_URL)
  const { platform, job } = await createPlatform(config.gitToken);
  console.log(`[Engine] Repository: ${job.repository}`);
  logger.progress(`Target repository: ${job.repository}`);

  // 3. Clone the repository
  const repositoryUrl = process.env.REPOSITORY_URL!;
  const { provider } = detectScmProvider(repositoryUrl);

  // 3a. Preflight: validate token grants repo access (fail fast before clone)
  try {
    await provider.validateAccess(config.gitToken);
    console.log(`[Engine] Repository access verified (${provider.platformName})`);
  } catch (err) {
    console.error(`[Engine] Repository access check failed: ${toErrorMessage(err)}`);
    logger.error("Could not access the repository — check REPO_ACCESS_TOKEN and REPOSITORY_URL.");
    process.exit(1);
  }

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
  const inferenceToken = process.env.OPENAI_API_KEY ?? process.env.INFERENCE_TOKEN ?? "";
  const llm = createInferenceClient(config.inferenceUrl, inferenceToken, config.inferenceProvider);

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
    const logPath = logger.logFilePath();
    logger.error(`Security scan did not complete${logPath ? ` — details in ${logPath}` : ""}.`);
    await platform.reportError(`Security scan failed: ${msg}`);
  }

  // 7. Finalize - commit and push any remaining changes
  gitFinalizeChanges(repoPath, "fix: Bright security scan remediations");
  logger.progress("Done.");

  // Exit explicitly — background timers (health probes) keep the event loop alive
  process.exit(0);
}

main().catch((err) => {
  console.error("[Engine] Fatal error:", err);
  const logPath = logger.logFilePath();
  logger.error(
    `Bright Agent encountered a fatal error${logPath ? ` — details in ${logPath}` : ""}.`,
  );
  process.exit(1);
});
