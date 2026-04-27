import { gitCommitAndPush } from "./platform.js";
import { execFileSync, type ChildProcess } from "child_process";
import treeKill from "tree-kill";
import type { OrchestratorContext, SecurityFix, Finding, DiscoveredEndpoint, TechStack, StartupConfig, BrightApiContext } from "./types.js";
import { ProgressReporter, type FindingSummary } from "./progress.js";
import { formatTechStack, toErrorMessage, findingKey, buildSeveritySummary, SEVERITY_ORDER, injectEnvVarsFromHint } from "./utils.js";
import { detectTechStack, discoverEndpoints } from "./phases/analyze.js";
import {
  discoverEndpointsViaSwagger,
} from "./phases/swagger.js";
import {
  startApplicationWithRetries,
  canBuildFromSource,
  captureDockerLogs,
  checkAppHealth,
  deepHealthCheck,
  quickRestartCompose,
  type StartupResult,
} from "./phases/startup.js";
import {
  detectAndConfigureAuth,
  testAuthObject,
  reRegisterUser,
  type AuthResult,
} from "./phases/auth.js";
import {
  detectFirstRunSetup,
  completeFirstRunSetup,
  type FirstRunSetupResult,
} from "./phases/setup.js";
import {
  registerEntrypoints,
  verifyEntrypointAuth,
  pruneDeadEntrypoints,
  type RegisteredEntrypoint,
} from "./phases/entrypoints.js";
import { setupRepeater, type RepeaterHandle } from "./phases/repeater.js";
import {
  selectTestsPerEndpoint,
  type ScanGroup,
} from "./phases/test-selection.js";
import {
  runSecurityScan,
  waitForScanCompletion,
  isFailureStatus,
} from "./phases/scan.js";
import { fetchFindings } from "./phases/findings.js";
import { generateFixes, applyFixes } from "./phases/fix.js";
import { runFunctionHarness, cleanupHarnessInfra, type HarnessResult } from "./phases/harness.js";
import { chatWithTools, type ModelSelector } from "./inference.js";
import { codebaseTools, createToolHandler } from "./tools.js";
import { AppHealthMonitor } from "./app-health.js";

const MAX_ITERATIONS = 5;
const MAX_FIX_REPAIR_ATTEMPTS = 2;

/**
 * Kill the current app process, restart, and re-register the test user.
 * Returns the new StartupResult. Throws on failure.
 */
async function restartApp(
  current: ChildProcess | undefined,
  llm: Parameters<typeof chatWithTools>[0],
  repoPath: string,
  techStack: TechStack,
  startupConfig: StartupConfig,
  modelSelector: ModelSelector,
  registration?: AuthResult["registration"],
  recoveryHints?: string[],
): Promise<StartupResult> {
  await killProcess(current);
  const result = await startApplicationWithRetries(
    llm,
    repoPath,
    techStack,
    startupConfig,
    modelSelector,
    recoveryHints,
  );
  if (registration) await reRegisterUser(registration);
  return result;
}

/**
 * Run the first-run setup phase if the app appears to need it.
 * Used both at the initial setup point and after every bounce-back rebuild
 * (since rebuilds can wipe runtime state). Returns updated credentials and
 * whether setup succeeded; safe to call when no setup is needed.
 */
async function runSetupIfNeeded(
  llm: Parameters<typeof chatWithTools>[0],
  repoPath: string,
  baseUrl: string,
  techStack: TechStack,
  startupConfig: StartupConfig,
  postStartSetupHints: string[] | undefined,
  modelSelector: ModelSelector,
  progress: ProgressReporter,
  context: string,
): Promise<{ ran: boolean; completed: boolean; credentials?: FirstRunSetupResult["credentials"]; summary: string }> {
  const needs = await detectFirstRunSetup(baseUrl, startupConfig, postStartSetupHints);
  if (!needs) return { ran: false, completed: false, summary: "Setup not needed" };

  await progress.phaseStart("first_run_setup", "Completing first-time application setup");
  console.log(`[Engine] App needs first-run setup (${context}) — running setup phase`);

  const baseModel = modelSelector.current();
  const criticModel = modelSelector.peekEscalated();
  let setupResult = await completeFirstRunSetup(
    llm,
    repoPath,
    baseUrl,
    techStack,
    startupConfig,
    postStartSetupHints ?? [],
    baseModel,
    criticModel,
  );

  if (!setupResult.completed && modelSelector.escalate()) {
    console.log(`[Engine] First-run setup failed (${context}) — retrying with escalated model`);
    setupResult = await completeFirstRunSetup(
      llm,
      repoPath,
      baseUrl,
      techStack,
      startupConfig,
      postStartSetupHints ?? [],
      modelSelector.current(),
      criticModel,
    );
  }

  if (setupResult.completed) {
    await progress.phaseDetail("first_run_setup", "done", `Setup completed: ${setupResult.summary}`);
    console.log(`[Engine] First-run setup completed (${context}): ${setupResult.summary}`);
    modelSelector.reset();
    return { ran: true, completed: true, credentials: setupResult.credentials, summary: setupResult.summary };
  }

  console.warn(`[Engine] First-run setup failed (${context}): ${setupResult.summary}`);
  await progress.phaseDetail("first_run_setup", "failed", `Setup failed: ${setupResult.summary}`);
  return { ran: true, completed: false, summary: setupResult.summary };
}

export async function runOrchestrator(ctx: OrchestratorContext): Promise<void> {
  const { repoPath, platform, llm, config } = ctx;
  const progress = new ProgressReporter(platform);

  let appProcess: ChildProcess | undefined;
  let repeater: RepeaterHandle | undefined;
  let harnessResult: HarnessResult | undefined;
  let healthMonitor: AppHealthMonitor | undefined;
  // Registration captured after auth completes — used by recovery callback to
  // re-register the seeded test user after a restart wipes runtime state.
  let authRegistration: AuthResult["registration"] | undefined;
  const allScanIds: string[] = [];
  const allFindings = new Map<string, FindingSummary>(); // dedupKey → summary
  const fixedKeys = new Set<string>();

  try {
    // ----- Phase 1: Tech stack + Start application (fail fast) -----
    await progress.phaseStart(
      "startup",
      "Detecting tech stack and starting the application",
    );
    const techStack = await detectTechStack(
      repoPath,
    );
    await progress.phaseDetail(
      "startup",
      "tech_stack",
      `Tech stack: ${formatTechStack(techStack)}`,
    );

    // ----- Function harness mode: skip full app startup -----
    if (config.runMode === "function") {
      console.log("[Engine] Running in function harness mode");
      await progress.phaseStart(
        "harness",
        "Running function harness mode — wrapping critical functions for scanning",
      );
      try {
        harnessResult = await runFunctionHarness(llm, repoPath, techStack, config.modelSelector);
        appProcess = harnessResult.process;
      } catch (err) {
        const msg = toErrorMessage(err);
        console.error(`[Harness] Function harness failed: ${msg}`);
        await progress.phaseStart("done", `Function harness mode failed: ${msg}`);
        return;
      }
      await progress.phaseDetail(
        "harness",
        "ready",
        `Harness running with ${harnessResult.endpoints.length} endpoint(s) on port ${harnessResult.config.port}`,
      );
      // Jump into scanning with harness endpoints (no auth needed)
      return await runScanLoop(ctx, progress, techStack, harnessResult, allScanIds, allFindings, fixedKeys);
    }

    // ----- Full mode: standard app startup -----

    // Early check: if there's no way to build from source, abort.
    if (!canBuildFromSource(repoPath)) {
      await progress.phaseStart(
        "done",
        "Cannot build application from source — no Dockerfile, package.json, or build system found. " +
          "Fixes cannot be tested against a pre-built remote image. Aborting.",
      );
      return;
    }

    let startup: StartupResult;
    try {
      startup = await startApplicationWithRetries(
        llm,
        repoPath,
        techStack,
        undefined,
        config.modelSelector,
      );
    } catch (startupErr) {
      const msg = toErrorMessage(startupErr);
      console.warn(`[Engine] Full app startup failed: ${msg}`);

      // In dynamic mode, no harness fallback — fail hard
      if (config.runMode === "dynamic") {
        await progress.phaseStart("done", `Application startup failed: ${msg}`);
        return;
      }

      // Full mode: fall back to function harness
      console.log("[Engine] Falling back to function harness mode...");
      await progress.phaseDetail(
        "startup",
        "fallback",
        "Full app startup failed — falling back to function harness mode",
      );
      try {
        harnessResult = await runFunctionHarness(llm, repoPath, techStack, config.modelSelector);
        appProcess = harnessResult.process;
        await progress.phaseDetail(
          "startup",
          "harness_ready",
          `Function harness running with ${harnessResult.endpoints.length} endpoint(s)`,
        );
        return await runScanLoop(ctx, progress, techStack, harnessResult, allScanIds, allFindings, fixedKeys);
      } catch (harnessErr) {
        console.error(`[Engine] Function harness also failed: ${toErrorMessage(harnessErr)}`);
        throw startupErr; // Throw original error
      }
    }
    appProcess = startup.process;
    let startupConfig = startup.config;
    let baseUrl = `http://localhost:${startupConfig.port}`;
    await progress.phaseDetail(
      "startup",
      "app_running",
      `Application running at ${baseUrl}`,
    );

    // Start the background health monitor. Recovery is limited to quick
    // compose restart (no LLM, no Dockerfile edits). Full LLM-driven
    // rebuilds are owned exclusively by the orchestrator's serial flow —
    // this eliminates race conditions between concurrent repair sessions.
    healthMonitor = new AppHealthMonitor({
      port: startupConfig.port,
      healthCheckPath: startupConfig.healthCheckPath,
      onDeepProbe: () =>
        deepHealthCheck(
          startupConfig.port,
          startupConfig.healthCheckPath ?? "/",
          llm,
          config.modelSelector,
        ),
    });
    healthMonitor.setRecoveryCallback(async (hint) => {
      // Quick restart only — handles transient crashes (OOM, stuck
      // process) without touching Dockerfiles or invoking the LLM.
      // If this fails, we stay unhealthy and let the orchestrator's
      // serial flow handle the full rebuild when it reaches a health
      // check point.
      if (!startupConfig.docker) {
        return { ok: false, detail: "not dockerized — orchestrator will handle full restart" };
      }
      console.log(
        `[Recovery] Quick compose restart${hint ? ` — hint: ${hint}` : ""}`,
      );
      const qr = await quickRestartCompose(repoPath, startupConfig);
      if (qr.ok) {
        return { ok: true, detail: "quick compose restart succeeded" };
      }
      console.warn(
        `[Recovery] Quick restart failed — staying unhealthy for orchestrator to handle`,
      );
      if (qr.diagnostics) {
        console.warn(`[Recovery] Diagnostics: ${qr.diagnostics}`);
      }
      return { ok: false, detail: qr.diagnostics ?? "quick restart failed" };
    });
    healthMonitor.start();

    // ----- Phase 2: Setup Bright project + repeater -----
    await progress.phaseStart(
      "setup",
      "Setting up Bright security scanner and Repeater",
    );

    const projectId = config.brightProjectId;
    if (!projectId) {
      throw new Error(
        "No Bright project ID configured. Set BRIGHT_PROJECT_ID environment variable.",
      );
    }
    console.log(`[Setup] Using Bright project: ${projectId}`);

    repeater = await setupRepeater(
      projectId,
      config,
    );
    await progress.phaseDetail(
      "setup",
      "repeater",
      "Repeater connected",
    );

    // ----- Phase 2.5: First-run setup (if needed) -----
    // Some apps (Umbraco, WordPress, Ghost, etc.) require completing an install wizard
    // before auth can work. Detect and complete it before the auth phase.
    let setupCredentials: FirstRunSetupResult["credentials"] | undefined;
    let setupCompleted = false;
    {
      const r = await runSetupIfNeeded(
        llm,
        repoPath,
        baseUrl,
        techStack,
        startupConfig,
        startup.postStartSetupHints,
        config.modelSelector,
        progress,
        "initial",
      );
      if (r.completed) {
        setupCredentials = r.credentials;
        setupCompleted = true;
      }
    }

    // ----- Phase 3: Auth configuration (fail fast — before expensive EP analysis) -----
    await progress.phaseStart("auth", "Detecting authentication requirements");

    // Build a lightweight context summary (no endpoints yet)
    let preAuthContext = buildContextSummary(techStack, startupConfig, [], 0);

    // If first-run setup created an admin, tell auth about it so it can skip user seeding
    if (setupCredentials) {
      preAuthContext += `\n\nIMPORTANT: A test user was already created during first-run setup:\n` +
        `- username: ${setupCredentials.username}\n` +
        `- email: ${setupCredentials.email}\n` +
        `- password: ${setupCredentials.password}\n` +
        `This user should work for authentication. Skip user registration/seeding and go straight to auth configuration.`;
    }

    const authResult = await detectAndConfigureAuth(
      llm,
      repoPath,
      techStack,
      projectId,
      baseUrl,
      repeater.repeaterId,
      config,
      config.modelSelector.current(),
      preAuthContext,
    );
    authRegistration = authResult.registration;
    await progress.phaseDetail(
      "auth",
      "auth_done",
      authResult.authObjectId
        ? "Auth configured"
        : "No authentication required",
    );

    // If auth was detected but failed to configure
    const MAX_INFRA_BOUNCEBACKS = 5;
    for (let bounce = 1; bounce <= MAX_INFRA_BOUNCEBACKS; bounce++) {
      if (!authResult.authFailed || !authResult.infraRepairHint) break;

      // Escalate the model on each bounce — harder problems need stronger models
      config.modelSelector.escalate();

      // ----- Auth infra bounce-back: repair infra and retry auth -----
      console.log(`[Engine] Auth infra bounce-back ${bounce}/${MAX_INFRA_BOUNCEBACKS} — repairing infrastructure`);
      console.log(`[Engine] Hint: ${authResult.infraRepairHint.slice(0, 200)}`);
      await progress.phaseDetail(
        "auth",
        "infra_repair",
        `Bounce-back ${bounce}: ${authResult.infraRepairHint.slice(0, 120)}`,
      );

      try {
        // C2: Programmatically inject env vars from hint before rebuilding
        const injected = injectEnvVarsFromHint(repoPath, authResult.infraRepairHint);
        if (injected.length > 0) {
          console.log(`[Engine] Auto-injected env vars from hint: ${injected.join(", ")}`);
        }

        const repairHints = [
          `[auth-infra-repair] ${authResult.infraRepairHint}`,
          `[auth-infra-repair] The auth phase identified this infrastructure problem. Fix it in compose.yml/Dockerfile/environment and rebuild.`,
        ];

        await killProcess(appProcess);
        const repairedStartup = await startApplicationWithRetries(
          llm,
          repoPath,
          techStack,
          startupConfig,
          config.modelSelector,
          repairHints,
        );

        // startApplicationWithRetries throws on failure, so if we're here it worked
        appProcess = repairedStartup.process;
        startupConfig = repairedStartup.config;
        baseUrl = `http://localhost:${startupConfig.port}`;
        if (authResult.registration) await reRegisterUser(authResult.registration);
        console.log(`[Engine] App restarted after infra repair — retrying auth`);

        // Re-run first-run setup if the app needs it again. Rebuilds wipe
        // any container-internal state (DB schema, admin users) so anything
        // that wasn't persisted in the source/compose tree is gone.
        // Also covers cases where the auth failure ITSELF was caused by a
        // missing schema / unseeded DB ("Invalid object name", "no such table",
        // "relation does not exist") that the rebuild revealed.
        try {
          const setupRetry = await runSetupIfNeeded(
            llm,
            repoPath,
            baseUrl,
            techStack,
            startupConfig,
            repairedStartup.postStartSetupHints ?? startup.postStartSetupHints,
            config.modelSelector,
            progress,
            `bounce-back ${bounce}`,
          );
          if (setupRetry.completed && setupRetry.credentials) {
            // New credentials — re-seed the auth context
            setupCredentials = setupRetry.credentials;
            preAuthContext = buildContextSummary(techStack, startupConfig, [], 0);
            preAuthContext +=
              `\n\nIMPORTANT: A test user was already created during first-run setup:\n` +
              `- username: ${setupCredentials.username}\n` +
              `- email: ${setupCredentials.email}\n` +
              `- password: ${setupCredentials.password}\n` +
              `This user should work for authentication. Skip user registration/seeding and go straight to auth configuration.`;
          }
        } catch (setupErr) {
          console.warn(`[Engine] Setup re-run after bounce-back failed: ${toErrorMessage(setupErr)}`);
        }

        const retryAuthResult = await detectAndConfigureAuth(
          llm,
          repoPath,
          techStack,
          projectId,
          baseUrl,
          repeater.repeaterId,
          config,
          config.modelSelector.current(),
          preAuthContext,
        );

        // Overwrite authResult so the loop re-checks infraRepairHint
        Object.assign(authResult, retryAuthResult);
        authRegistration = authResult.registration;

        if (retryAuthResult.authObjectId) {
          console.log(`[Engine] Auth bounce-back ${bounce} succeeded: ${retryAuthResult.authObjectId}`);
          await progress.phaseDetail(
            "auth",
            "auth_done",
            "Auth configured (after infra repair)",
          );
          break;
        } else if (retryAuthResult.infraRepairHint) {
          console.warn(`[Engine] Auth needs another infra repair: ${retryAuthResult.infraRepairHint.slice(0, 120)}`);
        } else {
          console.error("[Engine] Auth still failed after infra repair (not infra-related)");
          break; // Non-infra failure — no point bouncing again
        }
      } catch (bounceErr) {
        console.error(`[Engine] Auth infra bounce-back failed: ${toErrorMessage(bounceErr)}`);
        break;
      }
    }

    // After bounce-back (or if no bounce-back was needed), check final auth state
    if (authResult.authFailed) {
      if (config.runMode === "dynamic") {
        // Dynamic mode: auth is critical — fail the run
        console.error("[Engine] Auth configuration failed — aborting (dynamic mode requires working auth)");
        await progress.phaseDetail(
          "auth",
          "auth_failed",
          "Auth configuration failed — cannot scan without authentication in dynamic mode",
        );
        throw new Error("Auth configuration failed: the application requires authentication but we could not configure it. Aborting.");
      } else {
        // Full mode: fall back to function harness
        console.warn("[Engine] Auth configuration failed — falling back to function harness mode");
        await progress.phaseDetail(
          "auth",
          "fallback",
          "Auth failed — falling back to function harness mode (no auth needed)",
        );
        try {
          await killProcess(appProcess);
          harnessResult = await runFunctionHarness(llm, repoPath, techStack, config.modelSelector);
          appProcess = harnessResult.process;
          await progress.phaseDetail(
            "auth",
            "harness_ready",
            `Function harness running with ${harnessResult.endpoints.length} endpoint(s)`,
          );
          return await runScanLoop(ctx, progress, techStack, harnessResult, allScanIds, allFindings, fixedKeys);
        } catch (harnessErr) {
          console.error(`[Engine] Function harness also failed: ${toErrorMessage(harnessErr)}`);
          await progress.phaseStart(
            "done",
            "Authentication and function harness both failed. Cannot scan.",
          );
          return;
        }
      }
    }

    // Reset model to base tier after auth — endpoint discovery is less demanding
    config.modelSelector.reset();

    // ----- Phase 4: Swagger / OpenAPI discovery -----
    // Only surface this phase to the user if we actually find a spec — otherwise
    // it's just noise before the static-analysis step that always runs.
    const swaggerResult = await discoverEndpointsViaSwagger(baseUrl);

    let swaggerEndpoints: DiscoveredEndpoint[] = [];
    if (swaggerResult.source === "existing-spec" && swaggerResult.endpoints.length > 0) {
      await progress.phaseStart(
        "swagger",
        "Probing for OpenAPI/Swagger spec",
      );
      swaggerEndpoints = swaggerResult.endpoints;
      console.log(
        `[Swagger] Parsed ${swaggerEndpoints.length} endpoints from existing OpenAPI spec`,
      );
      await progress.phaseDetail(
        "swagger",
        "spec_found",
        `OpenAPI spec found — ${swaggerEndpoints.length} endpoints`,
      );
    } else {
      console.log("[Swagger] No spec found — will rely on static analysis");
    }

    // ----- Phase 5: Static analysis (always runs — fills gaps, enriches params) -----
    await progress.phaseStart(
      "analyze",
      "Analyzing source code for endpoints and parameters",
    );
    let staticEndpoints = await discoverEndpoints(
      llm,
      repoPath,
      techStack,
      config.modelSelector.current(),
    );

    // If no endpoints found, escalate model and retry once
    if (staticEndpoints.length === 0 && swaggerEndpoints.length === 0 && config.modelSelector.escalate()) {
      console.log(`[Analyze] No endpoints found — retrying with escalated model`);
      staticEndpoints = await discoverEndpoints(
        llm,
        repoPath,
        techStack,
        config.modelSelector.current(),
      );
    }

    console.log(
      `[Analyze] Discovered ${staticEndpoints.length} endpoints via static analysis`,
    );

    // Merge: swagger endpoints are authoritative for paths, static analysis
    // fills in missing endpoints and enriches params (body, query, path values)
    let endpoints: DiscoveredEndpoint[];
    if (swaggerEndpoints.length > 0) {
      endpoints = mergeSwaggerAndStaticEndpoints(swaggerEndpoints, staticEndpoints);
      console.log(
        `[Analyze] Merged: ${swaggerEndpoints.length} swagger + ${staticEndpoints.length} static → ${endpoints.length} total`,
      );
    } else {
      endpoints = staticEndpoints;
    }

    for (const ep of endpoints) {
      console.log(`[Analyze]   ${ep.method} ${ep.path}`);
    }
    await progress.phaseDetail(
      "analyze",
      "endpoints",
      `${endpoints.length} endpoints (${swaggerEndpoints.length > 0 ? `${swaggerEndpoints.length} from spec + ${staticEndpoints.length} from code` : "static analysis"})`,
    );

    if (endpoints.length === 0) {
      await progress.phaseStart(
        "done",
        "No HTTP endpoints found. Nothing to scan.",
      );
      return;
    }

    // Build full context summary for downstream phases (fix generation)
    const contextSummary = buildContextSummary(techStack, startupConfig, endpoints, swaggerEndpoints.length);

    // ----- Phase 6: Register entrypoints -----
    await progress.phaseStart(
      "entrypoints",
      "Registering API endpoints for scanning",
    );

    // Filter out endpoints that could corrupt application state or break auth.
    // DELETE: can remove users/data. PUT/PATCH on user/account paths: fuzzing
    // email/password fields changes the authenticated user's credentials,
    // which disrupts every scan that relies on that auth object.
    const safeEndpoints = endpoints.filter((ep) => {
      const method = ep.method.toUpperCase();
      const pathLower = ep.path.toLowerCase();

      // Always skip DELETE — too destructive
      if (method === "DELETE") {
        console.log(
          `[Entrypoints] Skipping destructive endpoint: ${ep.method} ${ep.path}`,
        );
        return false;
      }

      // Skip PUT/PATCH on user/account/profile mutation endpoints
      if (
        (method === "PUT" || method === "PATCH") &&
        isUserMutationPath(pathLower)
      ) {
        console.log(
          `[Entrypoints] Skipping user-mutation endpoint: ${ep.method} ${ep.path}`,
        );
        return false;
      }

      // Skip any endpoint whose body contains password/credential fields
      // (regardless of method) — fuzzing these breaks auth
      if (ep.body && hasCredentialFields(ep.body)) {
        console.log(
          `[Entrypoints] Skipping credential-mutating endpoint: ${ep.method} ${ep.path}`,
        );
        return false;
      }

      return true;
    });
    if (safeEndpoints.length < endpoints.length) {
      console.log(
        `[Entrypoints] Excluded ${endpoints.length - safeEndpoints.length} risky endpoint(s)`,
      );
    }

    let registered = await registerEntrypoints(
      config,
      projectId,
      safeEndpoints,
      baseUrl,
      repeater.repeaterId,
      authResult.authObjectId,
      healthMonitor,
    );
    await progress.phaseDetail(
      "entrypoints",
      "registered",
      `Registered ${registered.length} entrypoints`,
    );

    // Verify auth is working by checking entrypoint responses
    if (authResult.hasAuth && registered.length > 0) {
      console.log(
        `[Entrypoints] Verifying auth on ${registered.length} registered entrypoint(s)...`,
      );
      const check = await verifyEntrypointAuth(
        config,
        projectId,
        registered[0].entrypointId,
      );
      if (check.ok) {
        console.log(
          `[Entrypoints] ✓ Auth verification passed — ${check.detail}`,
        );
      } else {
        console.warn(
          `[Entrypoints] ✗ Auth verification failed — ${check.detail}`,
        );
      }
    }

    // Prune entrypoints that returned 404 — they waste scan time
    if (registered.length > 0) {
      registered = await pruneDeadEntrypoints(
        config,
        projectId,
        registered,
      );
      await progress.phaseDetail(
        "entrypoints",
        "pruned",
        `${registered.length} live entrypoints after pruning 404s`,
      );
    }

    // ----- Phase 7–9: Scan → Fix → Validate loop -----
    if (registered.length === 0) {
      await progress.phaseStart(
        "done",
        "No entrypoints could be registered with Bright. Check Bright API logs for validation errors.",
      );
      return;
    }

    // Extract paired arrays — now guaranteed to be in sync
    const liveEndpoints = registered.map((r) => r.endpoint);
    const entrypointIds = registered.map((r) => r.entrypointId);

    // ----- Phase 7: Select relevant tests per endpoint -----
    await progress.phaseStart(
      "test_selection",
      "Selecting relevant security tests per endpoint",
    );
    const scanGroups = await selectTestsPerEndpoint(
      llm,
      config,
      liveEndpoints,
      entrypointIds,
      techStack,
      authResult.hasAuth,
      config.modelSelector.current(),
    );
    await progress.phaseDetail(
      "test_selection",
      "selected",
      `Created ${scanGroups.length} scan group(s) with per-endpoint test selection`,
    );

    const allFixes: SecurityFix[] = [];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {

      // --- Verify auth before each scan round (after fixes) ---
      if (iteration > 0 && authResult.hasAuth && authResult.authObjectId) {
        console.log(`[Auth] Verifying auth before round ${iteration + 1}...`);
        const authOk = await verifyAndRepairAuth(
          llm,
          repoPath,
          techStack,
          authResult.authObjectId,
          config,
          allFixes,
          config.modelSelector.current(),
        );
        if (!authOk) {
          // Auth is broken and couldn't be repaired — need to restart the app
          // in case a code repair was applied, then retry
          try {
            const restart = await restartApp(appProcess, llm, repoPath, techStack, startupConfig, config.modelSelector, authResult.registration);
            appProcess = restart.process;
            // Retest after restart
            const retryOk = await verifyAndRepairAuth(
              llm,
              repoPath,
              techStack,
              authResult.authObjectId,
              config,
              allFixes,
              config.modelSelector.current(),
            );
            if (!retryOk) {
              await progress.phaseDetail(
                "scan",
                "auth_broken",
                "Auth broken after fixes — cannot continue scanning",
              );
              buildSummaryTable(progress, allFindings, fixedKeys);
              await progress.phaseStart(
                "done",
                `Authentication broke after round ${iteration} fixes and could not be repaired. ${allFixes.length} fixes were applied.`,
              );
              return;
            }
          } catch {
            buildSummaryTable(progress, allFindings, fixedKeys);
            await progress.phaseStart(
              "done",
              `App failed to restart for auth repair. ${allFixes.length} fixes were applied.`,
            );
            return;
          }
        }
      }

      // --- Verify app is alive before scanning ---
      const appAlive = await checkAppHealth(startupConfig.port, startupConfig.healthCheckPath);
      if (!appAlive) {
        console.warn(
          `[Scan] App is unreachable on port ${startupConfig.port} — restarting before scan`,
        );
        try {
          const restart = await restartApp(appProcess, llm, repoPath, techStack, startupConfig, config.modelSelector, authResult.registration);
          appProcess = restart.process;
          console.log("[Scan] App restarted successfully");
        } catch (err) {
          console.error(`[Scan] Failed to restart app: ${err}`);
          await progress.phaseStart(
            "scan_error",
            "Application crashed and could not be restarted.",
          );
          break;
        }
      }

      // --- Scan all groups ---
      await progress.phaseStart(
        "scan",
        `Running scans — round ${iteration + 1}`,
      );

      // Body-aware pre-scan health check. The shallow checkAppHealth above
      // returns true for any non-5xx — including HTTP 200 with a setup or
      // dev-mode warning page. verifyDeepHealth runs the LLM analyzer on
      // the actual response body, and if it flags trouble it triggers
      // recovery and blocks here until the app is healthy again.
      try {
        const deep = await healthMonitor.verifyDeepHealth();
        if (!deep.healthy) {
          console.warn(
            `[Scan] Deep health check still unhealthy after recovery: ${deep.reason}`,
          );
        }
      } catch (err) {
        console.warn(
          `[Scan] Deep health check errored (continuing): ${toErrorMessage(err)}`,
        );
      }

      const scanIds: string[] = [];
      for (const [gi, group] of scanGroups.entries()) {
        try {
          const scanId = await runSecurityScan(
            projectId,
            group.entrypointIds,
            repeater.repeaterId,
            group.tests,
            config,
            `Engine Pass ${iteration + 1} — Group ${gi + 1}`,
            group.hasPathParams,
          );
          scanIds.push(scanId);
          allScanIds.push(scanId);
          await progress.phaseDetail(
            "scan",
            "scan_launched",
            `Group ${gi + 1}: ${group.entrypointIds.length} endpoints · tests: ${group.tests.join(", ")}`,
          );
        } catch (err) {
          console.error(
            `[Scan] Failed to start scan for group ${gi + 1}: ${err}`,
          );
        }
      }

      if (scanIds.length === 0) {
        await progress.phaseStart(
          "scan_error",
          "All scan launches failed. Check Bright API logs.",
        );
        break;
      }

      // Wait for all scans to complete (in parallel) — log only, no PR spam
      const scanResults = await Promise.allSettled(
        scanIds.map(async (scanId, si) => {
          console.log(
            `[Scan] Waiting for scan ${si + 1}/${scanIds.length}: ${scanId}`,
          );
          const finalStatus = await waitForScanCompletion(
            config,
            scanId,
            (status, issues) => {
              console.log(
                `[Scan] Scan ${si + 1}/${scanIds.length}: ${status} — ${issues} issue(s)`,
              );
            },
            healthMonitor,
          );
          return finalStatus;
        }),
      );

      const succeededScanIds: string[] = [];
      const failedScanDetails: string[] = [];
      for (const [si, result] of scanResults.entries()) {
        const sid = scanIds[si];
        if (result.status === "rejected") {
          console.error(
            `[Scan] Error waiting for scan ${sid}: ${result.reason}`,
          );
          failedScanDetails.push(`${sid} (wait error)`);
        } else if (isFailureStatus(result.value)) {
          console.error(
            `[Scan] Scan ${sid} ended with status: ${result.value}`,
          );
          failedScanDetails.push(`${sid} (${result.value})`);
        } else {
          succeededScanIds.push(sid);
        }
      }

      const totalScans = scanIds.length;
      const failedCount = failedScanDetails.length;

      if (failedCount > 0 && succeededScanIds.length === 0) {
        // All scans failed — nothing to harvest. Try to recover or abort.
        const stillAlive = await checkAppHealth(startupConfig.port, startupConfig.healthCheckPath);
        if (!stillAlive) {
          console.warn(
            "[Scan] App appears to have crashed during scanning — attempting restart and retry",
          );
          try {
            const restart = await restartApp(appProcess, llm, repoPath, techStack, startupConfig, config.modelSelector, authResult.registration);
            appProcess = restart.process;
            console.log(
              "[Scan] App restarted — will retry scans on next iteration",
            );
            await progress.phaseDetail(
              "scan",
              "app_restart",
              `App crashed during round ${iteration + 1} — restarted, retrying`,
            );
            continue;
          } catch (restartErr) {
            console.error(
              `[Scan] Failed to restart app after crash: ${restartErr}`,
            );
            await progress.phaseStart(
              "scan_error",
              `Application crashed during round ${iteration + 1} and could not be restarted.`,
            );
            break;
          }
        }

        await progress.phaseStart(
          "scan_error",
          `All ${totalScans} scan(s) failed on round ${iteration + 1}. Check Bright dashboard.`,
        );
        break;
      }

      if (failedCount > 0) {
        // Partial failure — proceed with what succeeded, signal the gap.
        console.warn(
          `[Scan] Round ${iteration + 1}: ${failedCount}/${totalScans} scan(s) failed — proceeding with ${succeededScanIds.length} successful scan(s). Failed: ${failedScanDetails.join(", ")}`,
        );
        await progress.phaseDetail(
          "scan",
          "partial_failure",
          `Round ${iteration + 1}: ${failedCount}/${totalScans} scan(s) failed — continuing with findings from ${succeededScanIds.length} successful scan(s).`,
        );

        // If app died but we still have some findings, restart it so the
        // next round (if any) has a healthy target — but don't abort.
        const stillAlive = await checkAppHealth(startupConfig.port, startupConfig.healthCheckPath);
        if (!stillAlive) {
          console.warn(
            "[Scan] App appears to have crashed during scanning — attempting restart before processing findings",
          );
          try {
            const restart = await restartApp(appProcess, llm, repoPath, techStack, startupConfig, config.modelSelector, authResult.registration);
            appProcess = restart.process;
            console.log("[Scan] App restarted");
          } catch (restartErr) {
            console.error(
              `[Scan] Failed to restart app after crash: ${restartErr} — will still process findings from successful scans`,
            );
          }
        }
      }

      // --- Fetch findings (only from successful scans) ---
      const findings = await fetchFindings(
        config,
        succeededScanIds,
      );

      const sevSummary = buildSeveritySummary(findings);

      await progress.phaseDetail(
        "scan",
        "findings",
        findings.length > 0
          ? `Round ${iteration + 1} complete — ${findings.length} vulnerabilities found (${sevSummary})`
          : `Round ${iteration + 1} complete — no vulnerabilities found`,
      );

      // Track all findings — mark previously-seen ones as fixed if they didn't reappear
      if (iteration > 0) {
        const currentKeys = new Set(findings.map(findingKey));
        for (const key of allFindings.keys()) {
          if (!currentKeys.has(key)) {
            fixedKeys.add(key);
          }
        }
      }
      for (const f of findings) {
        const key = findingKey(f);
        if (!allFindings.has(key)) {
          allFindings.set(key, {
            name: f.name,
            severity: f.severity,
            url: f.url,
            method: f.method,
            status: "Open",
          });
        }
      }

      if (findings.length === 0) {
        // Mark everything as fixed
        for (const [, s] of allFindings) s.status = "Fixed";
        config.modelSelector.reset();
        buildSummaryTable(progress, allFindings, fixedKeys);
        const msg =
          iteration === 0
            ? "No vulnerabilities found — application appears secure."
            : `All vulnerabilities resolved after ${iteration + 1} round(s). ${allFixes.length} total fixes applied.`;
        await progress.phaseStart("done", msg);
        return;
      }

      // Escalate model if fixes didn't reduce the vulnerability count
      if (iteration > 0) {
        const previousCount = allFindings.size - fixedKeys.size;
        if (findings.length >= previousCount) {
          config.modelSelector.escalate();
        } else {
          config.modelSelector.reset();
        }
      }

      // Last iteration is validation-only
      if (iteration === MAX_ITERATIONS - 1) {
        buildSummaryTable(progress, allFindings, fixedKeys);
        await progress.phaseStart(
          "done",
          `Reached ${MAX_ITERATIONS} rounds. ${findings.length} vulnerabilities remain. ${allFixes.length} fixes were applied.`,
        );
        return;
      }

      // --- Fix findings one at a time (commit each, restart once after all) ---
      await progress.phaseStart(
        "fix",
        `Fixing ${findings.length} vulnerabilities — round ${iteration + 1}`,
      );

      let fixedCount = 0;
      let skippedCount = 0;
      const fixCommitCount = { value: 0 }; // track commits for bisect

      for (const [fi, finding] of findings.entries()) {
        console.log(
          `[Fix] [${fi + 1}/${findings.length}] Fixing: ${finding.severity} — ${finding.name} at ${finding.url}`,
        );

        // Generate fix for this single finding
        let fixes: SecurityFix[];
        try {
          fixes = await generateFixes(
            llm,
            repoPath,
            techStack,
            [finding],
            allFixes,
            config.modelSelector.current(),
            contextSummary,
          );
        } catch (err) {
          console.error(
            `[Fix] Failed to generate fix for ${finding.name}: ${err}`,
          );
          skippedCount++;
          continue;
        }

        if (fixes.length === 0) {
          console.log(`[Fix] No fix generated for ${finding.name}`);
          skippedCount++;
          continue;
        }

        applyFixes(repoPath, fixes);
        allFixes.push(...fixes);

        // Commit this single fix (no restart yet)
        try {
          gitCommitAndPush(
            repoPath,
            `fix: ${finding.severity.toLowerCase()} — ${finding.name}`,
          );
          fixCommitCount.value++;
          console.log(`[Fix] Committed fix for ${finding.name}`);
        } catch (err) {
          console.error(`[Fix] Commit failed for ${finding.name}: ${err}`);
        }

        fixedCount++;
      }

      // --- Single restart after all fixes applied ---
      if (fixCommitCount.value > 0) {
        let healthy = false;

        try {
          const restart = await restartApp(appProcess, llm, repoPath, techStack, startupConfig, config.modelSelector, authResult.registration);
          appProcess = restart.process;
          healthy = true;
        } catch (startupErr) {
          console.error(
            `[Fix] App broken after applying ${fixCommitCount.value} fix(es): ${startupErr}`,
          );

          // Bisect to find the breaking commit
          const containerLogs = captureDockerLogs(repoPath);
          healthy = await bisectAndRevertBrokenFixes(
            llm,
            repoPath,
            techStack,
            startupConfig,
            containerLogs,
            fixCommitCount.value,
            allFixes,
            config.modelSelector.current(),
            config.modelSelector,
          );
          if (healthy) {
            const restart = await restartApp(undefined, llm, repoPath, techStack, startupConfig, config.modelSelector, authResult.registration);
            appProcess = restart.process;
          } else {
            // Last resort: revert ALL fix commits from this round
            console.log(
              `[Fix] Reverting all ${fixCommitCount.value} fix commits from this round`,
            );
            try {
              execFileSync(
                "git",
                ["revert", "--no-edit", `HEAD~${fixCommitCount.value}..HEAD`],
                { cwd: repoPath, stdio: "pipe" },
              );
              execFileSync("git", ["push"], { cwd: repoPath, stdio: "pipe" });
              const restart = await restartApp(undefined, llm, repoPath, techStack, startupConfig, config.modelSelector, authResult.registration);
              appProcess = restart.process;
            } catch {
              console.error("[Fix] Could not recover — aborting fix round");
            }
          }
        }

        // Verify auth after restart
        if (healthy && authResult.hasAuth && authResult.authObjectId) {
          const authOk = await verifyAndRepairAuth(
            llm,
            repoPath,
            techStack,
            authResult.authObjectId,
            config,
            allFixes,
            config.modelSelector.current(),
          );
          if (!authOk) {
            console.warn(
              "[Fix] Auth broken after fixes — will attempt repair on next round",
            );
          }
        }
      }

      await progress.phaseDetail(
        "fix",
        "summary",
        `Round ${iteration + 1}: fixed ${fixedCount}, skipped ${skippedCount}`,
      );
    }
  } finally {
    // Always publish the summary table — ensures ROI even on failure
    buildSummaryTable(progress, allFindings, fixedKeys);
    await progress.updatePrDescription();

    // Stop the health monitor before tearing things down so it doesn't
    // try to recover an app we're about to kill.
    if (healthMonitor) healthMonitor.stop();

    // Cleanup
    await killProcess(appProcess);
    await killProcess(repeater?.process);

    // Stop any scans that are still running
    await stopRunningScans(
      config,
      allScanIds,
    );

    // Delete the repeater from Bright to avoid stale entries
    if (repeater?.repeaterId) {
      await deleteRepeater(
        config,
        repeater.repeaterId,
      );
    }

    // Clean up harness infra (standalone DB containers)
    if (harnessResult) {
      cleanupHarnessInfra(repoPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Simplified scan loop for function-harness mode (no auth, no fix/rebuild)
// ---------------------------------------------------------------------------
async function runScanLoop(
  ctx: OrchestratorContext,
  progress: ProgressReporter,
  techStack: Awaited<ReturnType<typeof detectTechStack>>,
  harnessResult: HarnessResult,
  allScanIds: string[],
  allFindings: Map<string, FindingSummary>,
  fixedKeys: Set<string>,
): Promise<void> {
  const { llm, config } = ctx;
  const projectId = config.brightProjectId;
  if (!projectId) {
    throw new Error("No Bright project ID configured. Set BRIGHT_PROJECT_ID.");
  }

  const baseUrl = `http://localhost:${harnessResult.config.port}`;

  // Setup repeater
  await progress.phaseStart("setup", "Setting up Bright Repeater for harness scan");
  const repeater = await setupRepeater(
    projectId,
    config,
  );
  await progress.phaseDetail("setup", "repeater", "Repeater connected");

  try {
    // Register harness endpoints (no auth)
    await progress.phaseStart("entrypoints", "Registering harness endpoints");
    const registered = await registerEntrypoints(
      config,
      projectId,
      harnessResult.endpoints,
      baseUrl,
      repeater.repeaterId,
      undefined, // no auth
    );
    await progress.phaseDetail(
      "entrypoints",
      "registered",
      `Registered ${registered.length} harness entrypoints`,
    );

    if (registered.length === 0) {
      await progress.phaseStart("done", "No harness entrypoints could be registered.");
      return;
    }

    const liveEndpoints = registered.map((r) => r.endpoint);
    const entrypointIds = registered.map((r) => r.entrypointId);

    // Select tests
    await progress.phaseStart("test_selection", "Selecting security tests for harness endpoints");
    const scanGroups = await selectTestsPerEndpoint(
      llm,
      config,
      liveEndpoints,
      entrypointIds,
      techStack,
      false, // no auth
      config.modelSelector.current(),
    );
    await progress.phaseDetail(
      "test_selection",
      "selected",
      `Created ${scanGroups.length} scan group(s)`,
    );

    // Run scans
    await progress.phaseStart("scan", "Running security scans on harness endpoints");
    const scanIds: string[] = [];
    for (const [gi, group] of scanGroups.entries()) {
      try {
        const scanId = await runSecurityScan(
          projectId,
          group.entrypointIds,
          repeater.repeaterId,
          group.tests,
          config,
          `Harness Scan — Group ${gi + 1}`,
          group.hasPathParams,
        );
        scanIds.push(scanId);
        allScanIds.push(scanId);
        await progress.phaseDetail(
          "scan",
          "scan_launched",
          `Group ${gi + 1}: ${group.entrypointIds.length} endpoints · tests: ${group.tests.join(", ")}`,
        );
      } catch (err) {
        console.error(`[Scan] Failed to start harness scan group ${gi + 1}: ${err}`);
      }
    }

    if (scanIds.length === 0) {
      await progress.phaseStart("scan_error", "All harness scan launches failed.");
      return;
    }

    // Wait for completion
    const scanResults = await Promise.allSettled(
      scanIds.map(async (scanId, si) => {
        console.log(`[Scan] Waiting for harness scan ${si + 1}/${scanIds.length}: ${scanId}`);
        return await waitForScanCompletion(
          config,
          scanId,
          (status, issues) => {
            console.log(`[Scan] Harness scan ${si + 1}: ${status} — ${issues} issue(s)`);
          },
        );
      }),
    );

    const succeededScanIds: string[] = [];
    const failedScanDetails: string[] = [];
    for (const [si, result] of scanResults.entries()) {
      const sid = scanIds[si];
      if (result.status === "rejected") {
        console.error(`[Scan] Error in harness scan ${sid}: ${result.reason}`);
        failedScanDetails.push(`${sid} (wait error)`);
      } else if (isFailureStatus(result.value)) {
        console.error(`[Scan] Harness scan ${sid} ended with status: ${result.value}`);
        failedScanDetails.push(`${sid} (${result.value})`);
      } else {
        succeededScanIds.push(sid);
      }
    }

    if (failedScanDetails.length > 0) {
      console.warn(
        `[Scan] Harness: ${failedScanDetails.length}/${scanIds.length} scan(s) failed — proceeding with ${succeededScanIds.length} successful scan(s). Failed: ${failedScanDetails.join(", ")}`,
      );
      await progress.phaseDetail(
        "scan",
        "partial_failure",
        `Harness: ${failedScanDetails.length}/${scanIds.length} scan(s) failed — continuing with findings from ${succeededScanIds.length} successful scan(s).`,
      );
    }

    if (succeededScanIds.length === 0) {
      await progress.phaseStart(
        "scan_error",
        `All ${scanIds.length} harness scan(s) failed.`,
      );
      return;
    }

    // Fetch findings (only from successful scans)
    const findings = await fetchFindings(
      config,
      succeededScanIds,
    );

    const sevSummary = buildSeveritySummary(findings);

    await progress.phaseDetail(
      "scan",
      "findings",
      findings.length > 0
        ? `Harness scan complete — ${findings.length} vulnerabilities found (${sevSummary})`
        : "Harness scan complete — no vulnerabilities found",
    );

    for (const f of findings) {
      const key = findingKey(f);
      if (!allFindings.has(key)) {
        allFindings.set(key, {
          name: f.name,
          severity: f.severity,
          url: f.url,
          method: f.method,
          status: "Open",
        });
      }
    }

    buildSummaryTable(progress, allFindings, fixedKeys);
    await progress.updatePrDescription();

    await progress.phaseStart(
      "done",
      findings.length > 0
        ? `Function harness scan found ${findings.length} vulnerability(ies). Review findings in Bright dashboard.`
        : "Function harness scan completed — no vulnerabilities found.",
    );
  } finally {
    await killProcess(repeater.process);
    await stopRunningScans(config, allScanIds);
    if (repeater.repeaterId) {
      await deleteRepeater(config, repeater.repeaterId);
    }
  }
}

function buildSummaryTable(
  progress: ProgressReporter,
  allFindings: Map<string, FindingSummary>,
  fixedKeys: Set<string>,
): void {
  const summaries: FindingSummary[] = [];
  for (const [key, finding] of allFindings) {
    summaries.push({
      ...finding,
      status: fixedKeys.has(key) ? "Fixed" : finding.status,
    });
  }
  // Sort: Critical first, then High, Medium, Low; Fixed last within each severity
  summaries.sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 4;
    const sb = SEVERITY_ORDER[b.severity] ?? 4;
    if (sa !== sb) return sa - sb;
    if (a.status !== b.status) return a.status === "Open" ? -1 : 1;
    return 0;
  });
  progress.setFindingsSummary(summaries);
}

// ---------------------------------------------------------------------------
// Merge Swagger + Static endpoint lists
// ---------------------------------------------------------------------------

/**
 * Merge endpoints from Swagger spec with static analysis results.
 *
 * Strategy:
 * - Start with swagger endpoints (authoritative for paths)
 * - For each swagger endpoint, enrich with param data from static if available
 *   (swagger specs often lack sample values for body/query/path params)
 * - Add any static-only endpoints not covered by swagger (gap filling)
 */
function mergeSwaggerAndStaticEndpoints(
  swagger: DiscoveredEndpoint[],
  staticEps: DiscoveredEndpoint[],
): DiscoveredEndpoint[] {
  // Build a lookup from static analysis by normalized method+path
  const staticByKey = new Map<string, DiscoveredEndpoint>();
  for (const ep of staticEps) {
    // Normalize: strip sample path param values back to :param for matching
    const key = `${ep.method.toUpperCase()} ${ep.path}`;
    staticByKey.set(key, ep);
  }

  const merged: DiscoveredEndpoint[] = [];
  const coveredKeys = new Set<string>();

  for (const swEp of swagger) {
    const key = `${swEp.method.toUpperCase()} ${swEp.path}`;
    coveredKeys.add(key);

    // Try to find a matching static endpoint to enrich from
    const staticEp = staticByKey.get(key);

    if (staticEp) {
      // Enrich swagger endpoint with static analysis data
      merged.push({
        ...swEp,
        filePath: staticEp.filePath !== "openapi-spec" ? staticEp.filePath : swEp.filePath,
        // Prefer static body if swagger has none (or swagger body is just "{}")
        body: isUsefulBody(swEp.body) ? swEp.body : staticEp.body,
        contentType: swEp.contentType || staticEp.contentType,
        // Merge query params — static may have discovered extra ones
        queryParams: mergeQueryParams(swEp.queryParams, staticEp.queryParams),
      });
    } else {
      merged.push(swEp);
    }
  }

  // Add static-only endpoints not in swagger (gap filling)
  for (const ep of staticEps) {
    const key = `${ep.method.toUpperCase()} ${ep.path}`;
    if (!coveredKeys.has(key)) {
      merged.push(ep);
    }
  }

  return merged;
}

function isUsefulBody(body?: string | null): boolean {
  if (!body) return false;
  const trimmed = body.trim();
  return trimmed !== "" && trimmed !== "{}" && trimmed !== "null";
}

function mergeQueryParams(
  a?: Array<{ name: string; value: string }>,
  b?: Array<{ name: string; value: string }>,
): Array<{ name: string; value: string }> | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  const seen = new Set(a.map((p) => p.name));
  const merged = [...a];
  for (const param of b) {
    if (!seen.has(param.name)) {
      merged.push(param);
      seen.add(param.name);
    }
  }
  return merged.length > 0 ? merged : undefined;
}

function killProcess(proc: ChildProcess | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (!proc || !proc.pid) {
      resolve();
      return;
    }
    treeKill(proc.pid, "SIGTERM", () => resolve());
  });
}

async function stopRunningScans(
  api: BrightApiContext,
  scanIds: string[],
): Promise<void> {
  if (scanIds.length === 0) return;

  const headers = {
    Authorization: `Api-Key ${api.brightToken}`,
    "Content-Type": "application/json",
  };

  const results = await Promise.allSettled(
    scanIds.map(async (scanId) => {
      // Check current status first
      const statusRes = await fetch(
        `https://${api.brightHostname}/api/v1/scans/${encodeURIComponent(scanId)}`,
        { headers },
      );
      if (!statusRes.ok) return;

      const scan = (await statusRes.json()) as { status?: string };
      const active = ["pending", "running", "queued", "scheduled"];
      if (!scan.status || !active.includes(scan.status)) return;

      console.log(`[Cleanup] Stopping scan ${scanId} (status: ${scan.status})`);
      const stopRes = await fetch(
        `https://${api.brightHostname}/api/v1/scans/${encodeURIComponent(scanId)}/lifecycle`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({ action: "stop" }),
        },
      );

      if (stopRes.ok) {
        console.log(`[Cleanup] Scan ${scanId} stopped`);
      } else {
        console.warn(
          `[Cleanup] Failed to stop scan ${scanId}: ${stopRes.status}`,
        );
      }
    }),
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.warn(`[Cleanup] ${failed.length} scan stop request(s) failed`);
  }
}

async function deleteRepeater(
  api: BrightApiContext,
  repeaterId: string,
): Promise<void> {
  try {
    console.log(`[Cleanup] Deleting repeater ${repeaterId}`);
    const res = await fetch(
      `https://${api.brightHostname}/api/v1/repeaters/${encodeURIComponent(repeaterId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Api-Key ${api.brightToken}` },
      },
    );
    if (res.ok || res.status === 204) {
      console.log("[Cleanup] Repeater deleted");
    } else {
      console.warn(
        `[Cleanup] Failed to delete repeater: ${res.status} ${res.statusText}`,
      );
    }
  } catch (err) {
    console.error(`[Cleanup] Failed to delete repeater: ${err}`);
  }
}

const MAX_AUTH_REPAIR_ATTEMPTS = 3;

/**
 * Verify the auth object still works. If a code fix broke the auth endpoint
 * (e.g. /api/users/me now returns 403), prompt the LLM to diagnose and repair.
 * Returns true if auth is working, false if it could not be repaired.
 */
async function verifyAndRepairAuth(
  llm: Parameters<typeof chatWithTools>[0],
  repoPath: string,
  techStack: TechStack,
  authObjectId: string,
  api: BrightApiContext,
  allFixes: SecurityFix[],
  model?: string,
): Promise<boolean> {
  // First, test the auth object directly via Bright API
  const testResult = await testAuthObject(
    api,
    authObjectId,
  );
  if (testResult.passed) {
    console.log("[Auth] Pre-scan auth verification passed");
    return true;
  }

  console.warn(
    `[Auth] Pre-scan auth verification FAILED: ${testResult.summary}`,
  );

  const handleTool = createToolHandler(repoPath);
  const stackStr = formatTechStack(techStack);

  const recentFixes = allFixes
    .slice(-10)
    .map(
      (f) =>
        `- ${f.vulnerability.name}: ${f.summary}\n  Files: ${f.files.map((ff) => ff.path).join(", ")}`,
    )
    .join("\n");

  for (let attempt = 1; attempt <= MAX_AUTH_REPAIR_ATTEMPTS; attempt++) {
    console.log(`[Auth] Repair attempt ${attempt}/${MAX_AUTH_REPAIR_ATTEMPTS}`);

    try {
      const messages: Parameters<typeof chatWithTools>[1] = [
        {
          role: "system",
          content: `You are a senior developer debugging an authentication failure in a ${stackStr} application.

The application had a working authentication system that passed all tests. After security fixes were applied, the auth object test is now FAILING. Something in the recent code changes broke the authentication flow.

The auth object ID is: ${authObjectId}
You can fetch its full configuration using the getAuth tool if needed.

Your job:
1. Look at the recent fixes that were applied (listed below)
2. Use codebase tools to read the affected files and auth-related code
3. Identify what change broke authentication (e.g. a middleware change that now blocks the login or protected endpoint)
4. Fix the code so that:
   - The auth endpoint works correctly again (login succeeds, protected endpoints return 200 with valid token)
   - The security fix is preserved where possible — but auth MUST work

Common causes:
- A security fix added overly aggressive input validation that blocks valid login requests
- A fix changed response headers or removed the token from the response
- A fix added CORS/CSP headers that block the auth cookie
- A fix changed route middleware ordering so auth middleware runs before the route
- A fix sanitized the request body in a way that corrupts the login payload`,
        },
        {
          role: "user",
          content: `The auth object test just FAILED with these results:

${testResult.summary}

Recent security fixes that were applied:
${recentFixes}

Please:
1. Read the files modified by recent fixes, especially anything related to auth, login, middleware, or the protected endpoint
2. Identify what broke the authentication
3. Fix it

Respond with a JSON array of corrected files:
\`\`\`json
[
  {
    "path": "src/example.ts",
    "content": "...full corrected file content..."
  }
]
\`\`\`

If no code change is needed (e.g. the issue is transient), respond with an empty array: \`[]\``,
        },
      ];

      const response = await chatWithTools(
        llm,
        messages,
        codebaseTools,
        handleTool,
        model,
      );
      const jsonStr =
        response.match(/```(?:json)?\s*\n?([\s\S]*?)```/)?.[1] ?? response;
      const parsed = JSON.parse(jsonStr);
      const files = Array.isArray(parsed) ? parsed : [];

      if (files.length > 0) {
        const patches = files.map((f: { path: string; content: string }) => ({
          path: f.path,
          content: f.content,
        }));
        applyFixes(repoPath, [
          {
            vulnerability: {
              id: "auth-repair",
              name: "Auth repair",
              severity: "High",
              url: "",
              method: "",
              details: "",
              remedy: "",
              issueId: "auth-repair",
            },
            summary: `Repaired broken auth (attempt ${attempt})`,
            verified: false,
            files: patches,
          },
        ]);

        try {
          gitCommitAndPush(
            repoPath,
            `fix: repair broken authentication (attempt ${attempt})`,
          );
        } catch {
          /* ignore commit failure */
        }

        await new Promise((r) => setTimeout(r, 3_000));
      }

      // Retest
      const retest = await testAuthObject(
        api,
        authObjectId,
      );
      if (retest.passed) {
        console.log(`[Auth] Auth repaired on attempt ${attempt}`);
        return true;
      }
      console.warn(
        `[Auth] Auth still failing after repair attempt ${attempt}: ${retest.summary}`,
      );
    } catch (err) {
      console.error(`[Auth] Auth repair attempt ${attempt} failed: ${err}`);
    }
  }

  console.error("[Auth] Could not repair auth after all attempts");
  return false;
}

/**
 * Binary-search the last N fix commits to find which one broke the app.
 * Reverts the breaking commit(s) and returns true if the app is recoverable.
 */
async function bisectAndRevertBrokenFixes(
  llm: Parameters<typeof chatWithTools>[0],
  repoPath: string,
  techStack: TechStack,
  startupConfig: StartupResult["config"],
  containerLogs: string,
  commitCount: number,
  allFixes: SecurityFix[],
  model?: string,
  modelSelector?: ModelSelector,
): Promise<boolean> {
  if (commitCount <= 0) return false;

  // Simple approach: first try diagnosing + repairing
  for (let repair = 0; repair < MAX_FIX_REPAIR_ATTEMPTS; repair++) {
    try {
      const repairFixes = await diagnoseAndRepairBrokenFix(
        llm,
        repoPath,
        techStack,
        containerLogs,
        allFixes,
        model,
      );
      if (repairFixes.length > 0) {
        applyFixes(repoPath, repairFixes);
        allFixes.push(...repairFixes);
        try {
          gitCommitAndPush(
            repoPath,
            `fix: repair broken fix (attempt ${repair + 1})`,
          );
        } catch {
          /* ignore */
        }
      }
      // Test if app starts now
      const restart = await startApplicationWithRetries(
        llm,
        repoPath,
        techStack,
        startupConfig,
        modelSelector,
      );
      await killProcess(restart.process);
      console.log(`[Fix] Repaired after ${repair + 1} attempt(s)`);
      return true;
    } catch {
      console.error(`[Fix] Repair attempt ${repair + 1} failed`);
    }
  }

  // Repair failed — bisect by reverting commits one at a time from newest to oldest
  // Collect the fix commit SHAs first so we revert original commits, not revert-of-reverts
  console.log(`[Fix] Bisecting ${commitCount} fix commits to find the breaker`);
  let fixShas: string[];
  try {
    fixShas = execFileSync("git", ["log", "--format=%H", `-${commitCount}`], {
      cwd: repoPath,
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    console.error("[Fix] Could not read commit log for bisect");
    return false;
  }

  for (let i = 0; i < fixShas.length; i++) {
    try {
      execFileSync("git", ["revert", "--no-edit", fixShas[i]], {
        cwd: repoPath,
        stdio: "pipe",
      });
      execFileSync("git", ["push"], { cwd: repoPath, stdio: "pipe" });
    } catch {
      // Abort the failed revert to clean up the repo state
      try {
        execFileSync("git", ["revert", "--abort"], {
          cwd: repoPath,
          stdio: "pipe",
        });
      } catch {
        /* no revert in progress */
      }
      try {
        execFileSync("git", ["reset", "--hard", "HEAD~1"], {
          cwd: repoPath,
          stdio: "pipe",
        });
        execFileSync("git", ["push", "--force-with-lease"], {
          cwd: repoPath,
          stdio: "pipe",
        });
      } catch {
        return false;
      }
    }

    try {
      const restart = await startApplicationWithRetries(
        llm,
        repoPath,
        techStack,
        startupConfig,
        modelSelector,
      );
      await killProcess(restart.process);
      console.log(`[Fix] App recovered after reverting ${i + 1} commit(s)`);
      return true;
    } catch {
      console.log(
        `[Fix] Still broken after reverting ${i + 1} commit(s), continuing bisect...`,
      );
    }
  }

  return false;
}

async function diagnoseAndRepairBrokenFix(
  llm: Parameters<typeof chatWithTools>[0],
  repoPath: string,
  techStack: TechStack,
  containerLogs: string,
  appliedFixes: SecurityFix[],
  model?: string,
): Promise<SecurityFix[]> {
  const handleTool = createToolHandler(repoPath);
  const stackStr = formatTechStack(techStack);

  const fixSummary = appliedFixes
    .map(
      (f) =>
        `- ${f.vulnerability.name}: ${f.summary}\n  Files: ${f.files.map((ff) => ff.path).join(", ")}`,
    )
    .join("\n");

  const messages: Parameters<typeof chatWithTools>[1] = [
    {
      role: "system",
      content: `You are a senior developer debugging a build/runtime failure.
The application (${stackStr}) was working before security fixes were applied, but now it fails to start.
You have tools to read files and search the codebase.
Your job: analyze the container logs, identify what the fix broke, and produce corrected files.`,
    },
    {
      role: "user",
      content: `The following security fixes were just applied, and now the application won't start:

${fixSummary}

Container logs showing the error:
\`\`\`
${containerLogs.slice(0, 4000)}
\`\`\`

Please:
1. Read the files that were modified by the fixes
2. Identify the syntax error, import error, or logic error introduced
3. Fix it while preserving the security improvement where possible

Respond with a JSON array of file fixes:
\`\`\`json
[
  {
    "path": "src/example.ts",
    "content": "...full corrected file content..."
  }
]
\`\`\``,
    },
  ];

  const response = await chatWithTools(
    llm,
    messages,
    codebaseTools,
    handleTool,
    model,
  );

  try {
    const jsonStr =
      response.match(/```(?:json)?\s*\n?([\s\S]*?)```/)?.[1] ?? response;
    const parsed = JSON.parse(jsonStr);
    const files = Array.isArray(parsed) ? parsed : [];

    if (files.length === 0) return [];

    // Use a dummy Finding to satisfy the SecurityFix type
    const dummyFinding: Finding = {
      id: "repair",
      name: "Build repair",
      severity: "High",
      url: "",
      method: "",
      details: "Repaired broken security fix",
      remedy: "",
      issueId: "repair",
    };

    return [
      {
        vulnerability: dummyFinding,
        summary: "Repaired broken security fix that prevented app startup",
        verified: false,
        files: files.map((f: { path: string; content: string }) => ({
          path: f.path,
          content: f.content,
        })),
      },
    ];
  } catch {
    console.error("[Fix] Could not parse repair response");
    return [];
  }
}

// Patterns for paths that modify user identity / credentials.
// Fuzzing these endpoints changes the authenticated user's email/password,
// which breaks the auth object and disrupts all subsequent scans.
const USER_MUTATION_PATTERNS = [
  /\/users?\/me\b/,
  /\/users?\/profile\b/,
  /\/users?\/account\b/,
  /\/profile\b/,
  /\/account\b/,
  /\/settings\/password\b/,
  /\/change[_-]?password\b/,
  /\/reset[_-]?password\b/,
  /\/update[_-]?password\b/,
  /\/update[_-]?email\b/,
  /\/update[_-]?profile\b/,
  /\/users?\/\d+$/, // PUT /users/1
  /\/users?\/[^/]+\/password\b/,
];

function isUserMutationPath(pathLower: string): boolean {
  return USER_MUTATION_PATTERNS.some((re) => re.test(pathLower));
}

// Body field names that indicate credential mutation.
// If the scanner fuzzes these, auth breaks.
const CREDENTIAL_FIELD_RE =
  /\b(password|passwd|new_password|newPassword|currentPassword|current_password|oldPassword|old_password)\b/i;

function hasCredentialFields(body: string): boolean {
  return CREDENTIAL_FIELD_RE.test(body);
}

/**
 * Build a concise summary of what previous phases learned about the application.
 * Injected into downstream phase prompts so the LLM starts with context rather
 * than re-discovering everything from scratch.
 */
function buildContextSummary(
  techStack: TechStack,
  startupConfig: StartupConfig,
  endpoints: DiscoveredEndpoint[],
  swaggerEndpointCount: number,
): string {
  const stack = formatTechStack(techStack);
  const methods = new Map<string, number>();
  for (const ep of endpoints) {
    methods.set(ep.method, (methods.get(ep.method) ?? 0) + 1);
  }
  const methodBreakdown = [...methods.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([m, c]) => `${m}:${c}`)
    .join(", ");

  const lines = [
    `Tech stack: ${stack}`,
    `Deployment: ${startupConfig.docker ? "Docker" : "native"} on port ${startupConfig.port}`,
    `Startup command: ${startupConfig.command}`,
  ];
  if (startupConfig.healthCheckSummary) {
    lines.push(`Health check: ${startupConfig.healthCheckSummary}`);
  }
  if (endpoints.length > 0) {
    lines.push(`Endpoints: ${endpoints.length} total (${methodBreakdown})`);
  }
  if (swaggerEndpointCount > 0) {
    lines.push(`OpenAPI spec available (${swaggerEndpointCount} endpoints from spec)`);
  }
  if (techStack.databases.length > 0) {
    lines.push(`Databases: ${techStack.databases.join(", ")}`);
  }
  return lines.join("\n");
}
