import { gitCommitAndPush, gitFinalizeChanges } from "./platform.js";
import { execFileSync, type ChildProcess } from "child_process";
import treeKill from "tree-kill";
import type { OrchestratorContext, SecurityFix, Finding, DiscoveredEndpoint, TechStack, StartupConfig, BrightApiContext } from "./types.js";
import { ProgressReporter, type FindingSummary } from "./progress.js";
import { formatTechStack, toErrorMessage, findingKey, buildSeveritySummary, SEVERITY_ORDER, injectEnvVarsFromHint, sleep } from "./utils.js";
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
  findComposeFile,
  type StartupResult,
  type DeepProbeCache,
} from "./phases/startup.js";
import {
  detectAndConfigureAuth,
  testAuthObject,
  reRegisterUser,
  replaySeedCommands,
  type AuthResult,
  type SeedCommand,
} from "./phases/auth.js";
import {
  detectFirstRunSetup,
  completeFirstRunSetup,
  type FirstRunSetupResult,
} from "./phases/setup.js";
import {
  registerEntrypoints,
  resolvePathParams,
  verifyEntrypointAuth,
  pruneDeadEntrypoints,
  type RegisteredEntrypoint,
} from "./phases/entrypoints.js";
import { setupRepeater, type RepeaterHandle } from "./phases/repeater.js";
import { prepareScanEnvironment, replayScanPrep } from "./phases/scan-prep.js";
import {
  selectTestsPerEndpoint,
  type ScanGroup,
} from "./phases/test-selection.js";
import {
  runSecurityScan,
  waitForScanCompletion,
  isFailureStatus,
  setScanLifecycle,
} from "./phases/scan.js";
import { fetchFindings } from "./phases/findings.js";
import { generateFixes, applyFixes } from "./phases/fix.js";
import { runFunctionHarness, cleanupHarnessInfra, type HarnessResult } from "./phases/harness.js";
import {
  parseSarif,
  mapFindingsToEndpoints,
  runValidationScans,
  resolveBrightTests,
  formatValidationReport,
  summarizeResults,
  toValidationSummaryRows,
} from "./phases/validation.js";
import { listTests } from "./bright-api.js";
import { chatWithTools, type ModelSelector, TokenTracker } from "./inference.js";
import { codebaseTools, createToolHandler } from "./tools.js";
import { AppHealthMonitor } from "./app-health.js";
import {
  assembleBrightStar,
  writeBrightStar,
  readBrightStar,
  brightStarToStartupConfig,
  brightStarAuthHints,
  type BrightStar,
} from "./brightstar.js";

const MAX_ITERATIONS = 5;
const MAX_FIX_REPAIR_ATTEMPTS = 2;

const FINDING_TEST_RULES: Array<{ pattern: RegExp; tests: string[] }> = [
  { pattern: /\bcve\b|known vulnerable|vulnerable component|retire/i, tests: ["cve_test"] },
  { pattern: /secret|token|credential|password|api key/i, tests: ["secret_tokens"] },
  { pattern: /sql injection|\bsqli\b/i, tests: ["sqli"] },
  { pattern: /no\s*sql|nosql/i, tests: ["nosql"] },
  { pattern: /stored xss|stored cross.?site/i, tests: ["stored_xss"] },
  { pattern: /cross.?site scripting|\bxss\b/i, tests: ["xss"] },
  { pattern: /html injection/i, tests: ["html_injection"] },
  { pattern: /css injection/i, tests: ["css_injection"] },
  { pattern: /iframe injection/i, tests: ["iframe_injection"] },
  { pattern: /local file inclusion|\blfi\b|path traversal|directory traversal/i, tests: ["lfi"] },
  { pattern: /remote file inclusion|\brfi\b/i, tests: ["rfi"] },
  { pattern: /server.?side request forgery|\bssrf\b/i, tests: ["ssrf"] },
  { pattern: /open redirect|unvalidated redirect/i, tests: ["unvalidated_redirect"] },
  { pattern: /\bcsrf\b|cross.?site request forgery/i, tests: ["csrf"] },
  { pattern: /\bjwt\b|json web token/i, tests: ["jwt"] },
  { pattern: /brute force/i, tests: ["brute_force_login"] },
  { pattern: /file upload|upload/i, tests: ["file_upload"] },
  { pattern: /command injection|os command|\bosi\b/i, tests: ["osi"] },
  { pattern: /template injection|\bssti\b/i, tests: ["ssti"] },
  { pattern: /\bxxe\b|xml external/i, tests: ["xxe"] },
  { pattern: /xpath/i, tests: ["xpathi"] },
  { pattern: /ldap/i, tests: ["ldapi"] },
  { pattern: /prototype pollution|proto pollution/i, tests: ["proto_pollution"] },
  { pattern: /server.?side javascript|server.?side js/i, tests: ["server_side_js_injection"] },
  { pattern: /prompt injection/i, tests: ["prompt_injection"] },
  { pattern: /insecure output/i, tests: ["insecure_output_handling"] },
  { pattern: /id enumeration|identifier enumeration/i, tests: ["id_enumeration"] },
  { pattern: /broken object property|bopla|property level authorization/i, tests: ["bopla"] },
  { pattern: /excessive data exposure/i, tests: ["excessive_data_exposure"] },
  { pattern: /full path disclosure/i, tests: ["full_path_disclosure"] },
  { pattern: /directory listing/i, tests: ["directory_listing"] },
  { pattern: /common files?/i, tests: ["common_files"] },
  { pattern: /version control|\.git|\.svn/i, tests: ["version_control_systems"] },
  { pattern: /open cloud storage|public bucket/i, tests: ["open_cloud_storage"] },
  { pattern: /s3 takeover|bucket takeover/i, tests: ["amazon_s3_takeover"] },
  { pattern: /email injection/i, tests: ["email_injection"] },
];

function addHint(hints: string[], hint: string): void {
  const compact = hint.replace(/\s+/g, " ").trim().slice(0, 900);
  if (!compact) return;
  if (hints.some((existing) => existing === compact || existing.includes(compact) || compact.includes(existing))) {
    return;
  }
  hints.push(compact);
}

function mergeHints(target: string[], source: string[] | undefined): void {
  for (const hint of source ?? []) {
    addHint(target, hint);
  }
}

/**
 * Heuristic: is the LLM-provided INFRA_REPAIR hint specific enough that we
 * should trust it even when /health is OK? `/health` is a deliberately cheap
 * endpoint and routinely returns 200 while protected routes 5xx for unrelated
 * reasons (missing env vars, missing migrations, missing modules, etc.). When
 * the LLM has cited a concrete error fragment from the running app or an
 * explicit env-var name, the gate produces false negatives that abort the
 * scan instead of repairing it.
 *
 * Returns true when:
 *   - We already mutated compose.yml (envVarsInjectedCount > 0): the running
 *     container will not see the change without a rebuild, so we MUST proceed.
 *   - The hint mentions an UPPERCASE env-var-shaped identifier AND a typical
 *     server-error fragment ("is not set", "is missing", "no such table",
 *     "relation does not exist", "cannot find module", etc.) — i.e. the LLM
 *     is reporting an error string it actually observed, not guessing.
 */
function isSpecificInfraHint(hint: string | undefined, envVarsInjectedCount: number): boolean {
  if (envVarsInjectedCount > 0) return true;
  if (!hint) return false;

  const envVarMention = /\b[A-Z][A-Z0-9_]{3,}\b/.test(hint);
  const errorPhrases: RegExp[] = [
    /\bis not set\b/i,
    /\bis missing\b/i,
    /\bis required\b/i,
    /\bnot configured\b/i,
    /\bnot defined\b/i,
    /\bmust be (?:set|provided|defined)\b/i,
    /\bno such (?:file|table|column|directory)\b/i,
    /\brelation .* does not exist\b/i,
    /\bcannot find module\b/i,
    /\benoent\b/i,
    /\bmissing (?:env|environment)\b/i,
    /\bundefined env\b/i,
    /\bpermission denied\b/i,
    /\b(?:HTTP\s*)?5\d\d\b/, // explicit reference to a 5xx the LLM saw
  ];
  return envVarMention && errorPhrases.some((re) => re.test(hint));
}

interface ValidationScanPlan {
  groups: ScanGroup[];
  targetKeys: Set<string>;
  missed: Finding[];
}

function buildValidationScanPlan(
  findings: Finding[],
  registered: RegisteredEntrypoint[],
  baselineGroups: ScanGroup[],
): ValidationScanPlan {
  const registeredById = new Map(registered.map((r) => [r.entrypointId, r]));
  const testsByEntrypoint = new Map<string, Set<string>>();
  for (const group of baselineGroups) {
    for (const epId of group.entrypointIds) {
      const tests = testsByEntrypoint.get(epId) ?? new Set<string>();
      for (const test of group.tests) tests.add(test);
      testsByEntrypoint.set(epId, tests);
    }
  }

  const groupsByKey = new Map<string, ScanGroup>();
  const targetKeys = new Set<string>();
  const missed: Finding[] = [];

  for (const finding of findings) {
    const entrypointId = resolveFindingEntrypointId(finding, registeredById, registered);
    if (!entrypointId) {
      missed.push(finding);
      continue;
    }

    const tests = testsForFinding(finding, testsByEntrypoint.get(entrypointId));
    if (tests.length === 0) {
      missed.push(finding);
      continue;
    }

    targetKeys.add(findingKey(finding));
    const registeredEntry = registeredById.get(entrypointId);
    const hasPathParams = registeredEntry ? /[:{}]/.test(registeredEntry.endpoint.path) : false;

    for (const test of tests) {
      const key = `${entrypointId}::${test}`;
      if (!groupsByKey.has(key)) {
        groupsByKey.set(key, {
          entrypointIds: [entrypointId],
          tests: [test],
          hasPathParams,
        });
      }
    }
  }

  return { groups: [...groupsByKey.values()], targetKeys, missed };
}

function resolveFindingEntrypointId(
  finding: Finding,
  registeredById: Map<string, RegisteredEntrypoint>,
  registered: RegisteredEntrypoint[],
): string | undefined {
  if (finding.entrypointId && registeredById.has(finding.entrypointId)) {
    return finding.entrypointId;
  }

  const findingMethod = finding.method.toUpperCase();
  const findingPath = normalizeUrlPath(finding.url);
  if (!findingPath) return undefined;

  const exact = registered.find((entry) =>
    entry.endpoint.method.toUpperCase() === findingMethod &&
    normalizeUrlPath(entry.endpoint.fullUrl ?? entry.endpoint.path) === findingPath,
  );
  if (exact) return exact.entrypointId;

  const withoutQuery = findingPath.split("?")[0];
  const pathOnly = registered.find((entry) =>
    entry.endpoint.method.toUpperCase() === findingMethod &&
    normalizeUrlPath(entry.endpoint.fullUrl ?? entry.endpoint.path).split("?")[0] === withoutQuery,
  );
  return pathOnly?.entrypointId;
}

function normalizeUrlPath(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    const path = value.startsWith("/") ? value : `/${value}`;
    return path.replace(/\/+/g, "/");
  }
}

function testsForFinding(
  finding: Finding,
  selectedTests: Set<string> | undefined,
): string[] {
  const tests = new Set<string>();
  if (finding.testTag) {
    tests.add(finding.testTag);
  }

  const haystack = `${finding.name}\n${finding.details}\n${finding.remedy}`;
  for (const rule of FINDING_TEST_RULES) {
    if (rule.pattern.test(haystack)) {
      for (const test of rule.tests) tests.add(test);
    }
  }

  if (tests.size === 0) {
    for (const test of selectedTests ?? []) tests.add(test);
  }

  const filtered = [...tests].filter((test) => !selectedTests || selectedTests.has(test));
  if (filtered.length > 0) return filtered;
  return [...(selectedTests ?? [])];
}

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
  monitor?: AppHealthMonitor,
  seedCommands?: SeedCommand[],
): Promise<StartupResult> {
  await monitor?.pause();
  try {
    await killProcess(current);
    const result = await startApplicationWithRetries(
      llm,
      repoPath,
      techStack,
      startupConfig,
      modelSelector,
      recoveryHints,
    );
    // Re-seed the test user: try CLI replay first (handles docker exec cases),
    // then fall back to HTTP registration
    if (seedCommands?.length) {
      await replaySeedCommands(repoPath, seedCommands);
    } else if (registration) {
      await reRegisterUser(registration);
    }
    return result;
  } finally {
    monitor?.resume();
  }
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
): Promise<{ ran: boolean; completed: boolean; credentials?: FirstRunSetupResult["credentials"]; summary: string; infraRepairHint?: string }> {
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

  // If infra repair needed, return immediately — caller will rebuild and retry
  if (!setupResult.completed && setupResult.infraRepairHint) {
    console.log(`[Engine] First-run setup needs infra repair (${context}): ${setupResult.infraRepairHint.slice(0, 200)}`);
    await progress.phaseDetail("first_run_setup", "failed", `Setup blocked: ${setupResult.summary}`);
    return { ran: true, completed: false, summary: setupResult.summary, infraRepairHint: setupResult.infraRepairHint };
  }

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

    // Check again for infra repair after escalated retry
    if (!setupResult.completed && setupResult.infraRepairHint) {
      console.log(`[Engine] Escalated setup also needs infra repair (${context}): ${setupResult.infraRepairHint.slice(0, 200)}`);
      await progress.phaseDetail("first_run_setup", "failed", `Setup blocked: ${setupResult.summary}`);
      return { ran: true, completed: false, summary: setupResult.summary, infraRepairHint: setupResult.infraRepairHint };
    }
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
  // Every new phase starts at the base model and escalates only on its own
  // failure — reset the tier on each phase change so escalation never leaks
  // across phase boundaries.
  const progress = new ProgressReporter(platform, (phase) => {
    if (config.modelSelector.isEscalated()) {
      console.log(`[Model] New phase "${phase}" — resetting to base model`);
      config.modelSelector.reset();
    }
  });

  let appProcess: ChildProcess | undefined;
  let repeater: RepeaterHandle | undefined;
  let harnessResult: HarnessResult | undefined;
  let healthMonitor: AppHealthMonitor | undefined;
  // Run memory: the FINAL known-good config captured at the point the app is
  // proven startable + authenticated. Persisted to BRIGHT_STAR.md at the end so
  // a future run can pre-prep. Holds only what works — not intermediate tries.
  const runMemory: {
    techStack?: TechStack;
    startup?: StartupConfig;
    auth?: AuthResult;
    setupCompleted?: boolean;
    setupCredentials?: Record<string, string>;
    scanPrepReplayCommands?: Array<{ container: string; command: string }>;
    endpointNotes?: string[];
  } = {};
  // Set when a BRIGHT_STAR.md was loaded at start (used to pre-prep + skip churn).
  let loadedBrightStar: BrightStar | null = null;
  // Registration captured after auth completes — used by recovery callback to
  // re-register the seeded test user after a restart wipes runtime state.
  let authRegistration: AuthResult["registration"] | undefined;
  const allScanIds: string[] = [];
  const allFindings = new Map<string, FindingSummary>(); // dedupKey → summary
  const fixedKeys = new Set<string>();
  /** Tracks how many times recovery fired for rate-limit/throttle reasons.
   *  After 1 replay+restart, escalates to full LLM scan-prep repair.
   *  After 2 total attempts, stops trying (non-recoverable by restart). */
  let rateLimitRecoveryAttempts = 0;
  const MAX_RATE_LIMIT_RECOVERIES = 2;

  // Adaptive scan throttling: track health flaps during active scanning.
  // If the app repeatedly dies under load, pause half the scans.
  let healthFlapCount = 0;
  const activeScanIds: string[] = []; // populated when scans are launched
  const pausedForThrottle: string[] = []; // scans paused to reduce load

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

    // ----- Pre-prep from prior run memory (BRIGHT_STAR.md), if present -----
    // Holds the known-good startup/auth/scan-prep config from a previous run.
    // We feed it back to each phase as a strong prior to skip rediscovery.
    loadedBrightStar = readBrightStar(repoPath);
    if (loadedBrightStar) {
      console.log("[BrightStar] Found BRIGHT_STAR.md — pre-prepping pipeline from prior run memory");
      await progress.phaseDetail(
        "startup",
        "brightstar",
        "Loaded prior run memory (BRIGHT_STAR.md) — reusing known-good startup/auth config",
      );
    }

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
        const brief = msg.length > 200
          ? msg.slice(0, msg.indexOf("\n", 80) > 0 ? msg.indexOf("\n", 80) : 200) + "…"
          : msg;
        await progress.phaseStart("done", `Function harness mode failed: ${brief}`);
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

    let startup!: StartupResult;
    try {
      startup = await startApplicationWithRetries(
        llm,
        repoPath,
        techStack,
        brightStarToStartupConfig(loadedBrightStar) ?? undefined,
        config.modelSelector,
      );
    } catch (startupErr) {
      const msg = toErrorMessage(startupErr);
      console.warn(`[Engine] Full app startup failed: ${msg}`);

      // --- Partial boot: strip non-essential services and retry ---
      // Before failing hard (dynamic mode) or falling back to function harness
      // (full mode), try booting the app with just the essential deps (DB, Redis).
      // Many apps fail because of Keycloak, SMTP, Ollama, watchtower, etc. —
      // services Bright doesn't scan through anyway. Stripping them often lets
      // the app boot with most routes working (some 500 on missing-dep calls,
      // which is fine for DAST scanning the rest).
      const composeFile = findComposeFile(repoPath);
      if (composeFile) {
        try {
          const { stripNonEssentialServices } = await import("./phases/partial-boot.js");
          const { strippedFile, removed } = stripNonEssentialServices(repoPath, composeFile);
          if (removed.length > 0) {
            console.log(`[Engine] Attempting partial boot without: ${removed.join(", ")}`);
            await progress.phaseDetail(
              "startup",
              "partial_boot",
              `Trying partial boot — stripped ${removed.length} non-essential service(s): ${removed.join(", ")}`,
            );
            // Rename the stripped file to compose.yml so startApplicationWithRetries
            // finds it naturally without needing a previous config override.
            const { renameSync } = await import("fs");
            const { resolve } = await import("path");
            const origPath = resolve(repoPath, composeFile);
            const backupPath = origPath + ".full-backup";
            renameSync(origPath, backupPath);
            renameSync(resolve(repoPath, strippedFile), origPath);

            const partialStartup = await startApplicationWithRetries(
              llm,
              repoPath,
              techStack,
              undefined,
              config.modelSelector,
              [`[partial-boot] Non-essential services stripped: ${removed.join(", ")}. The app may 500 on routes that need these services — that's acceptable for DAST scanning.`],
            );
            console.log("[Engine] Partial boot succeeded — proceeding with available routes");
            startup = partialStartup;
          }
        } catch (partialErr) {
          console.warn(`[Engine] Partial boot also failed: ${toErrorMessage(partialErr)}`);
        }
      }

      // If partial boot didn't work (or didn't apply), use original fallback
      if (!startup) {
        // In dynamic mode, no harness fallback — fail hard
        if (config.runMode === "dynamic") {
          const brief = msg.length > 200
            ? msg.slice(0, msg.indexOf("\n", 80) > 0 ? msg.indexOf("\n", 80) : 200) + "…"
            : msg;
          await progress.phaseStart("done", `Application startup failed: ${brief}`);
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
          throw startupErr;
        }
      }
    }
    appProcess = startup.process;
    let startupConfig = startup.config;
    let baseUrl = `http://localhost:${startupConfig.port}`;
    const selectedApp = techStack.serviceRoot && techStack.serviceRoot !== "."
      ? techStack.serviceRoot
      : "repository root";
    await progress.setScanTarget(selectedApp, baseUrl);
    await progress.phaseDetail(
      "startup",
      "app_running",
      `Application running at ${baseUrl} (${selectedApp})`,
    );

    // Start the background health monitor. Recovery is limited to quick
    // compose restart (no LLM, no Dockerfile edits). Full LLM-driven
    // rebuilds are owned exclusively by the orchestrator's serial flow —
    // this eliminates race conditions between concurrent repair sessions.
    const deepProbeCache: DeepProbeCache = new Map();
    healthMonitor = new AppHealthMonitor({
      port: startupConfig.port,
      healthCheckPath: startupConfig.healthCheckPath,
      healthProbe: startupConfig.healthProbe,
      onDeepProbe: () => startupConfig.healthProbe
        ? Promise.resolve({ healthy: true, reason: "custom startup health probe configured; skipping GET-only deep probe" })
        : deepHealthCheck(
            startupConfig.port,
            startupConfig.healthCheckPath ?? "/",
            llm,
            config.modelSelector,
            deepProbeCache,
          ),
    });
    healthMonitor.setRecoveryCallback(async (hint) => {
      if (!startupConfig.docker) {
        return { ok: false, detail: "not dockerized — orchestrator will handle full restart" };
      }

      const isRateLimitIssue = isAuthRateLimitHint(hint);

      // --- Rate-limit smart recovery ---
      if (isRateLimitIssue) {
        rateLimitRecoveryAttempts++;
        console.log(
          `[Recovery] Rate-limit related (attempt ${rateLimitRecoveryAttempts}/${MAX_RATE_LIMIT_RECOVERIES})${hint ? ` — ${hint.slice(0, 120)}` : ""}`,
        );

        if (rateLimitRecoveryAttempts > MAX_RATE_LIMIT_RECOVERIES) {
          console.warn("[Recovery] Max rate-limit recovery attempts reached — giving up (code-level fix needed)");
          return { ok: false, detail: "rate-limit recovery exhausted — code-level throttle guard not removable by restart/replay" };
        }

        // Attempt 1: replay deterministic scan-prep commands + restart
        if (scanPrepReplayCommands.length > 0) {
          console.log(`[Recovery] Replaying ${scanPrepReplayCommands.length} scan-prep command(s) before restart...`);
          const { applied, failed } = replayScanPrep(repoPath, scanPrepReplayCommands);
          if (failed > 0) {
            console.warn(`[Recovery] Replay partial: ${applied} applied, ${failed} failed`);
          }
        }

        // Attempt 2+: replay didn't stick — escalate to full LLM scan-prep repair
        if (rateLimitRecoveryAttempts >= 2) {
          console.log("[Recovery] Running targeted LLM scan-prep repair for rate-limit removal...");
          try {
            const repairResult = await prepareScanEnvironment(
              llm, repoPath, baseUrl, techStack,
              config.modelSelector.current(),
              `URGENT: The app health monitor detected a rate-limit/throttle error during active scanning. The app is returning ThrottlerException or 429 responses. Find the rate-limiter in the source code and DISABLE it completely. Previous restart did not fix it — this is a code-level guard that must be patched. Hint: ${hint ?? "rate limit on health endpoint"}`,
            );
            if (repairResult.completed && repairResult.replayCommands?.length) {
              scanPrepReplayCommands = [...scanPrepReplayCommands, ...repairResult.replayCommands];
            }
            console.log(`[Recovery] LLM scan-prep repair: ${repairResult.completed ? "succeeded" : "failed"} — ${repairResult.summary}`);
          } catch (repairErr) {
            console.warn(`[Recovery] LLM scan-prep repair threw: ${toErrorMessage(repairErr)}`);
          }
        }

        // Always restart after replay/repair to apply changes
        const qr = await quickRestartCompose(repoPath, startupConfig);
        if (qr.ok) {
          deepProbeCache.clear();
          return { ok: true, detail: `rate-limit recovery (attempt ${rateLimitRecoveryAttempts}): replay + restart succeeded` };
        }
        return { ok: false, detail: qr.diagnostics ?? "restart after rate-limit repair failed" };
      }

      // --- Standard recovery: quick restart for transient crashes ---
      // Track repeated health flaps — if the app keeps dying under scan load,
      // we need to reduce concurrency rather than keep restarting.
      healthFlapCount++;
      const shouldThrottle = healthFlapCount >= 2 && activeScanIds.length > 2;
      if (shouldThrottle) {
        // Pause half the running scans to reduce load on the app
        const toPause = activeScanIds.slice(0, Math.ceil(activeScanIds.length / 2));
        console.log(
          `[Recovery] Health flap #${healthFlapCount} — throttling: pausing ${toPause.length}/${activeScanIds.length} scans to reduce app load`,
        );
        for (const sid of toPause) {
          await setScanLifecycle(config, sid, "pause").catch(() => {});
        }
        pausedForThrottle.push(...toPause);
      }

      console.log(
        `[Recovery] Quick compose restart${hint ? ` — hint: ${hint}` : ""}`,
      );
      const qr = await quickRestartCompose(repoPath, startupConfig);
      if (qr.ok) {
        deepProbeCache.clear();
        return { ok: true, detail: `quick compose restart succeeded${shouldThrottle ? ` (throttled to ${activeScanIds.length - pausedForThrottle.length} concurrent scans)` : ""}` };
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
    const MAX_SETUP_BOUNCEBACKS = 3;
    for (let setupBounce = 0; setupBounce <= MAX_SETUP_BOUNCEBACKS; setupBounce++) {
      const r = await runSetupIfNeeded(
        llm,
        repoPath,
        baseUrl,
        techStack,
        startupConfig,
        startup.postStartSetupHints,
        config.modelSelector,
        progress,
        setupBounce === 0 ? "initial" : `bounce-${setupBounce}`,
      );
      if (r.completed) {
        setupCredentials = r.credentials;
        setupCompleted = true;
        break;
      }
      if (!r.infraRepairHint || setupBounce >= MAX_SETUP_BOUNCEBACKS) break;

      // ----- Setup infra bounce-back: rebuild with the hint and retry -----
      console.log(`[Engine] Setup infra bounce-back ${setupBounce + 1}/${MAX_SETUP_BOUNCEBACKS} — repairing infrastructure`);
      console.log(`[Engine] Hint: ${r.infraRepairHint.slice(0, 200)}`);
      await progress.phaseDetail(
        "first_run_setup",
        "infra_repair",
        `Bounce-back ${setupBounce + 1}: ${r.infraRepairHint.slice(0, 120)}`,
      );

      try {
        const injected = injectEnvVarsFromHint(repoPath, r.infraRepairHint);
        if (injected.length > 0) {
          console.log(`[Engine] Auto-injected env vars from hint: ${injected.join(", ")}`);
        }

        const repairHints = [
          `[setup-infra-repair] ${r.infraRepairHint}`,
          `[setup-infra-repair] The first-run setup phase identified this infrastructure problem. Fix it in compose.yml/Dockerfile/environment and rebuild.`,
        ];

        healthMonitor?.stop();
        await killProcess(appProcess);
        const repairedStartup = await startApplicationWithRetries(
          llm,
          repoPath,
          techStack,
          startupConfig,
          config.modelSelector,
          repairHints,
        );

        appProcess = repairedStartup.process;
        startupConfig = repairedStartup.config;
        baseUrl = `http://localhost:${startupConfig.port}`;
        // Restart health monitor with new port
        healthMonitor = new AppHealthMonitor({
          port: startupConfig.port,
          healthCheckPath: startupConfig.healthCheckPath,
          healthProbe: startupConfig.healthProbe,
          onDeepProbe: () => startupConfig.healthProbe
            ? Promise.resolve({ healthy: true, reason: "custom startup health probe configured; skipping GET-only deep probe" })
            : deepHealthCheck(
                startupConfig.port,
                startupConfig.healthCheckPath ?? "/",
                llm,
                config.modelSelector,
                deepProbeCache,
              ),
        });
        healthMonitor.setRecoveryCallback(async (hint) => {
          if (!startupConfig.docker) {
            return { ok: false, detail: "not dockerized — orchestrator will handle full restart" };
          }
          const isRateLimitIssue = isAuthRateLimitHint(hint);
          if (isRateLimitIssue && scanPrepReplayCommands.length > 0) {
            rateLimitRecoveryAttempts++;
            console.log(`[Recovery] Rate-limit recovery (attempt ${rateLimitRecoveryAttempts}) — replaying scan-prep commands...`);
            replayScanPrep(repoPath, scanPrepReplayCommands);
          }
          const qr = await quickRestartCompose(repoPath, startupConfig);
          if (qr.ok) {
            deepProbeCache.clear();
            return { ok: true, detail: "quick compose restart succeeded" };
          }
          return { ok: false, detail: qr.diagnostics ?? "quick restart failed" };
        });
        healthMonitor.start();
        console.log(`[Engine] App restarted after setup infra repair — retrying setup`);
      } catch (rebuildErr) {
        console.error(`[Engine] Setup bounce-back rebuild failed: ${toErrorMessage(rebuildErr)}`);
        break;
      }
    }

    // ----- Phase 2.7: Scan preparation (relax rate limits, CAPTCHA, etc.) -----
    await progress.phaseStart("scan_prep", "Preparing application for security scanning");
    // Pause health monitor — scan-prep makes rapid requests that look like app failure
    await healthMonitor?.pause();
    let scanPrepReplayCommands: { container: string; command: string }[] = [];
    const authHints: string[] = [];

    // Pre-prep from prior run memory: replay known scan-prep commands and feed
    // the known-good auth flow to the auth phase as priors.
    if (loadedBrightStar?.limits?.scanPrepReplayCommands?.length) {
      scanPrepReplayCommands = [...loadedBrightStar.limits.scanPrepReplayCommands];
      console.log(
        `[BrightStar] Seeded ${scanPrepReplayCommands.length} scan-prep replay command(s) from prior run`,
      );
    }
    for (const h of brightStarAuthHints(loadedBrightStar)) {
      addHint(authHints, h);
    }
    try {
      let prepResult = await prepareScanEnvironment(
        llm,
        repoPath,
        baseUrl,
        techStack,
        config.modelSelector.current(),
      );
      if (prepResult.failureKind === "verification_missing") {
        console.warn("[Engine] Scan prep skipped mandatory POST verification — retrying targeted verification pass");
        await progress.phaseDetail("scan_prep", "verification_retry", prepResult.summary);
        prepResult = await prepareScanEnvironment(
          llm,
          repoPath,
          baseUrl,
          techStack,
          config.modelSelector.current(),
          [
            prepResult.summary,
            "The previous scan-prep pass reported success but did not use probe_url for 5+ rapid POST requests to the real login/auth processing endpoint.",
            "Do not stop at code inspection or edits. Restart/rebuild if needed, then perform the required POST verification and only report completed=true after those POSTs return non-429 responses.",
          ].join(" "),
        );
      }
      if (prepResult.completed && prepResult.changes.length > 0) {
        await progress.phaseDetail("scan_prep", "done", prepResult.summary);
        if (prepResult.replayCommands?.length) {
          scanPrepReplayCommands = prepResult.replayCommands;
        }
        addHint(authHints, `[scan-prep] ${prepResult.summary}`);
        for (const change of prepResult.changes) {
          addHint(authHints, `[scan-prep] ${change}`);
        }
      } else if (prepResult.completed) {
        await progress.phaseDetail("scan_prep", "done", "No changes needed");
        addHint(authHints, "[scan-prep] Completed: no rate-limit/security-control changes needed.");
      } else if (prepResult.failureKind === "login_5xx" && config.runMode === "dynamic") {
        console.warn(`[Engine] Scan prep found a crashing login endpoint — running durable source repair before auth`);
        await progress.phaseDetail("scan_prep", "login_repair", prepResult.summary);
        addHint(authHints, `[scan-prep] ${prepResult.summary}`);

        const repairHints = [
          `[scan-prep-login-repair] ${prepResult.summary}`,
          "[scan-prep-login-repair] The login endpoint returns only HTTP 5xx during scanner-prep verification. Diagnose the application error, apply durable source/config changes in the repository, rebuild/recreate the app containers, and verify login no longer returns 5xx before auth configuration.",
        ];

        healthMonitor?.stop();
        await killProcess(appProcess);
        const repairedStartup = await startApplicationWithRetries(
          llm,
          repoPath,
          techStack,
          startupConfig,
          config.modelSelector,
          repairHints,
        );

        appProcess = repairedStartup.process;
        startup = repairedStartup;
        startupConfig = repairedStartup.config;
        baseUrl = `http://localhost:${startupConfig.port}`;
        deepProbeCache.clear();

        healthMonitor = new AppHealthMonitor({
          port: startupConfig.port,
          healthCheckPath: startupConfig.healthCheckPath,
          healthProbe: startupConfig.healthProbe,
          onDeepProbe: () => startupConfig.healthProbe
            ? Promise.resolve({ healthy: true, reason: "custom startup health probe configured; skipping GET-only deep probe" })
            : deepHealthCheck(
                startupConfig.port,
                startupConfig.healthCheckPath ?? "/",
                llm,
                config.modelSelector,
                deepProbeCache,
              ),
        });
        healthMonitor.setRecoveryCallback(async (hint) => {
          if (!startupConfig.docker) {
            return { ok: false, detail: "not dockerized — orchestrator will handle full restart" };
          }
          const isRateLimitIssue = isAuthRateLimitHint(hint);
          if (isRateLimitIssue && scanPrepReplayCommands.length > 0) {
            rateLimitRecoveryAttempts++;
            console.log(`[Recovery] Rate-limit recovery (attempt ${rateLimitRecoveryAttempts}) — replaying scan-prep commands...`);
            replayScanPrep(repoPath, scanPrepReplayCommands);
          }
          const qr = await quickRestartCompose(repoPath, startupConfig);
          if (qr.ok) {
            deepProbeCache.clear();
            return { ok: true, detail: "quick compose restart succeeded" };
          }
          return { ok: false, detail: qr.diagnostics ?? "quick restart failed" };
        });
        healthMonitor.start();
      } else {
        // Scan-prep failed — retry once with escalated model and targeted hint
        console.warn(`[Engine] Scan prep failed (${prepResult.failureKind ?? "unknown"}): ${prepResult.summary} — retrying with escalated model`);
        await progress.phaseDetail("scan_prep", "retry", prepResult.summary);
        config.modelSelector.escalate();
        const retryResult = await prepareScanEnvironment(
          llm,
          repoPath,
          baseUrl,
          techStack,
          config.modelSelector.current(),
          `Previous attempt failed: ${prepResult.summary}. You MUST find and disable ALL rate limiters and security controls. If you found throttle/rate-limit code references in the codebase, PATCH THEM — do not report failure without attempting source code patches. Rebuild the app after patching, then verify with rapid requests.`,
        );
        if (retryResult.completed && retryResult.changes.length > 0) {
          await progress.phaseDetail("scan_prep", "done", retryResult.summary);
          if (retryResult.replayCommands?.length) {
            scanPrepReplayCommands = retryResult.replayCommands;
          }
          addHint(authHints, `[scan-prep] ${retryResult.summary}`);
          for (const change of retryResult.changes) {
            addHint(authHints, `[scan-prep] ${change}`);
          }
        } else {
          console.warn(`[Engine] Scan prep retry also failed: ${retryResult.summary} — continuing anyway`);
          await progress.phaseDetail("scan_prep", "warning", retryResult.summary);
          addHint(authHints, `[scan-prep-warning] ${retryResult.summary}`);
        }
      }
    } catch (prepErr) {
      console.warn(`[Engine] Scan prep error: ${toErrorMessage(prepErr)} — continuing anyway`);
      addHint(authHints, `[scan-prep-error] ${toErrorMessage(prepErr)}`);
    } finally {
      // Reset rate-limit recovery counter — scan-prep just ran, fresh state
      rateLimitRecoveryAttempts = 0;
      healthMonitor?.resume();
    }

    // ----- Phase 3: Auth configuration (fail fast — before expensive EP analysis) -----
    await progress.phaseStart("auth", "Detecting authentication requirements");
    // Pause health monitor — auth probes the app and transient 500s during
    // CSRF/login testing shouldn't trigger an infrastructure restart
    await healthMonitor?.pause();

    // Build a lightweight context summary (no endpoints yet)
    let preAuthContext = buildContextSummary(techStack, startupConfig, [], 0);

    // If first-run setup created an admin, tell auth about it so it can skip user seeding
    if (setupCredentials) {
      preAuthContext += `\n\nIMPORTANT: A test user was already created during first-run setup:\n` +
        `- username: ${setupCredentials.username}\n` +
        `- email: ${setupCredentials.email}\n` +
        `- password: ${setupCredentials.password}\n` +
        `This user should work for authentication. Skip user registration/seeding and go straight to auth configuration.`;
      addHint(
        authHints,
        `[setup-credentials] First-run setup created user username=${setupCredentials.username}, email=${setupCredentials.email}, password=${setupCredentials.password}. Prefer these credentials for auth.`,
      );
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
      authHints,
    );
    mergeHints(authHints, authResult.authHints);
    authRegistration = authResult.registration;
    if (authResult.authObjectId) {
      await progress.phaseDetail("auth", "auth_done", "Auth configured");
    } else if (!authResult.authFailed) {
      await progress.phaseDetail("auth", "auth_done", "No authentication required");
    } else {
      await progress.phaseDetail(
        "auth",
        "auth_attempt_failed",
        authResult.infraRepairHint
          ? "Auth needs application repair before configuration can continue"
          : "Auth configuration attempt failed",
      );
    }

    // If auth was detected but failed to configure
    const MAX_INFRA_BOUNCEBACKS = 5;
    let bouncedBack = false;
    for (let bounce = 1; bounce <= MAX_INFRA_BOUNCEBACKS; bounce++) {
      if (!authResult.authFailed || !authResult.infraRepairHint) break;
      bouncedBack = true;

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
        if (isAuthRateLimitHint(authResult.infraRepairHint)) {
          console.log("[Engine] Auth failure is rate-limit related — running targeted scan-prep repair instead of full startup rebuild");
          await healthMonitor?.pause();

          const rateLimitRepair = await prepareScanEnvironment(
            llm,
            repoPath,
            baseUrl,
            techStack,
            config.modelSelector.current(),
            authResult.infraRepairHint,
          );
          if (rateLimitRepair.completed) {
            await progress.phaseDetail("auth", "rate_limit_repair", rateLimitRepair.summary);
            addHint(authHints, `[auth-rate-limit-repair] ${rateLimitRepair.summary}`);
            if (rateLimitRepair.replayCommands?.length) {
              scanPrepReplayCommands = [
                ...scanPrepReplayCommands,
                ...rateLimitRepair.replayCommands,
              ];
            }
          } else {
            console.warn(`[Engine] Targeted rate-limit repair did not complete: ${rateLimitRepair.summary}`);
            await progress.phaseDetail("auth", "rate_limit_repair_failed", rateLimitRepair.summary);
            addHint(authHints, `[auth-rate-limit-repair-failed] ${rateLimitRepair.summary}`);
          }

          // Source-code limiter patches may already have rebuilt/recreated the
          // app from scan-prep. A quick restart is safe and clears in-memory
          // limiter state without letting the generic startup repair rewrite
          // Dockerfile/compose again.
          if (startupConfig.docker) {
            const qr = await quickRestartCompose(repoPath, startupConfig, 90_000);
            if (!qr.ok) {
              console.warn(`[Engine] Quick restart after rate-limit repair failed: ${qr.diagnostics ?? "unknown"}`);
            }
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
            authHints,
          );
          mergeHints(authHints, retryAuthResult.authHints);

          Object.assign(authResult, retryAuthResult);
          authRegistration = authResult.registration;

          if (retryAuthResult.authObjectId) {
            console.log(`[Engine] Auth rate-limit repair ${bounce} succeeded: ${retryAuthResult.authObjectId}`);
            await progress.phaseDetail(
              "auth",
              "auth_done",
              "Auth configured (after rate-limit repair)",
            );
            break;
          }
          if (retryAuthResult.infraRepairHint) {
            console.warn(`[Engine] Auth still needs repair: ${retryAuthResult.infraRepairHint.slice(0, 120)}`);
            continue;
          }
          console.error("[Engine] Auth still failed after targeted rate-limit repair (not infra-related)");
          break;
        }

        // C2: Programmatically inject env vars from hint before rebuilding
        const injected = injectEnvVarsFromHint(repoPath, authResult.infraRepairHint);
        if (injected.length > 0) {
          console.log(`[Engine] Auto-injected env vars from hint: ${injected.join(", ")}`);
        }

        // Gate: If the app is healthy AND the LLM's hint is vague, don't tear
        // it down — the problem is probably auth detection/configuration, not
        // infrastructure. Killing a healthy compose stack just because auth
        // can't find a login endpoint causes cascading failures (e.g.,
        // standalone restart loses Redis/DB companions).
        //
        // BUT: when the LLM provides a specific evidence-backed hint (env var
        // name + concrete server error like "X is not set"), or we already
        // injected env vars that will only take effect after a restart, /health
        // is the wrong signal. /health routinely passes while protected routes
        // 5xx for unrelated reasons (missing env vars, missing migrations).
        // In that case, trust the LLM and proceed with the rebuild.
        const healthProbe = startupConfig.healthProbe ?? startupConfig.healthCheckPath ?? "/";
        const appStillHealthy = await checkAppHealth(startupConfig.port, healthProbe);
        const hintIsSpecific = isSpecificInfraHint(authResult.infraRepairHint, injected.length);
        if (appStillHealthy && !hintIsSpecific) {
          console.warn(`[Engine] Auth requested INFRA_REPAIR but app is healthy (GET ${typeof healthProbe === "string" ? healthProbe : healthProbe.path} → OK) and the hint is not evidence-backed. Skipping infrastructure teardown — problem is auth config, not infra.`);
          await progress.phaseDetail(
            "auth",
            "infra_repair_skipped",
            "App is healthy — auth issue is not infrastructure-related",
          );

          // Capture the prior hint so we can short-circuit if the retry produces
          // the exact same diagnosis (no progress, no point burning more turns).
          const previousHint = (authResult.infraRepairHint ?? "").trim();

          // The hint we hand back to the LLM has to cover every "looks like
          // infra but isn't" case we've actually observed in production runs:
          // wrong auth method (OAuth API misidentified as session), credential
          // state mismatch (`incorrect-email-password` despite a seeded user),
          // wrong/unreachable test URL, missing login body fields, exception
          // inside the auth handler. The LLM should pivot strategy rather than
          // re-request INFRA_REPAIR.
          addHint(
            authHints,
            `[auth-infra-skipped] INFRA_REPAIR was requested but the application is healthy (GET ${typeof healthProbe === "string" ? healthProbe : healthProbe.path} → OK) so this is NOT an infrastructure problem. Do not request INFRA_REPAIR again for the same root cause. Pivot strategy: ` +
            `(a) re-verify the auth method — if session/credentials is failing with "incorrect-email-password", check the password actually works against the real signup/login flow (a test user inserted directly into the DB may not have the right bcrypt hash); ` +
            `(b) try alternative existing users in the DB (use run_command_in_docker against the database to list users and their roles); ` +
            `(c) try a different auth method entirely — Bearer API key, OAuth client_credentials, x-* header auth — if the API supports more than one; ` +
            `(d) re-verify the test URL — the chosen protected endpoint may not be reachable for the current user role; ` +
            `(e) re-verify required login body fields (csrfToken, callbackUrl, json shape) by probing the form/login page first.`,
          );

          // Bug C fix: instead of breaking out of the bounce-back loop and
          // aborting, give the LLM one more shot at auth with the augmented
          // hint as context. The retry uses whatever model the loop has
          // already escalated to. Bounded by MAX_INFRA_BOUNCEBACKS plus a
          // same-hint guard below.
          let retryAuthResult;
          try {
            retryAuthResult = await detectAndConfigureAuth(
              llm,
              repoPath,
              techStack,
              projectId,
              baseUrl,
              repeater.repeaterId,
              config,
              config.modelSelector.current(),
              preAuthContext,
              authHints,
            );
          } catch (retryErr) {
            console.error(`[Engine] Auth retry after non-infra skip threw: ${toErrorMessage(retryErr)}`);
            break;
          }

          mergeHints(authHints, retryAuthResult.authHints);
          Object.assign(authResult, retryAuthResult);
          authRegistration = authResult.registration;

          if (retryAuthResult.authObjectId) {
            console.log(`[Engine] Auth recovered after non-infra retry on bounce ${bounce}: ${retryAuthResult.authObjectId}`);
            await progress.phaseDetail(
              "auth",
              "auth_done",
              "Auth configured (after non-infra retry)",
            );
            break;
          }

          const newHint = (retryAuthResult.infraRepairHint ?? "").trim();
          if (newHint && previousHint && newHint === previousHint) {
            console.error(
              `[Engine] Auth retry produced the same non-infra diagnosis as before — no progress. Aborting bounce-back to avoid burning more turns.`,
            );
            break;
          }

          if (retryAuthResult.infraRepairHint) {
            console.log(
              `[Engine] Auth retry produced a different hint after the non-infra skip — letting the bounce-back loop process it.`,
            );
            continue;
          }

          // No hint and not configured — auth is just stuck. Bail.
          break;
        }
        if (appStillHealthy && hintIsSpecific) {
          console.log(
            `[Engine] /health is OK but the auth INFRA_REPAIR hint is specific (env-var + concrete error pattern${injected.length > 0 ? ` and ${injected.length} env var(s) were injected` : ""}). Trusting the LLM diagnosis and rebuilding.`,
          );
          await progress.phaseDetail(
            "auth",
            "infra_repair_forced",
            "Specific evidence-backed hint — proceeding with infra rebuild despite /health=OK",
          );
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
        // Re-seed test user: prefer CLI commands, fall back to HTTP registration
        if (authResult.seedCommands?.length) {
          await replaySeedCommands(repoPath, authResult.seedCommands);
        } else if (authResult.registration) {
          await reRegisterUser(authResult.registration);
        }
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
            addHint(
              authHints,
              `[setup-credentials] First-run setup created user username=${setupCredentials.username}, email=${setupCredentials.email}, password=${setupCredentials.password}. Prefer these credentials for auth.`,
            );
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
          authHints,
        );
        mergeHints(authHints, retryAuthResult.authHints);

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
    // Resume health monitor — auth phase complete, app is stable
    healthMonitor?.resume();

    // ----- Re-run scan-prep if bounce-backs rebuilt the app -----
    // Bounce-backs rebuild the DB/container which wipes DB-backed settings
    // (rate limits, CAPTCHA toggles, etc.) that scan-prep configured earlier.
    // Use deterministic replay of the exact commands that worked the first time.
    if (bouncedBack) {
      await healthMonitor?.pause();
      try {
        if (scanPrepReplayCommands.length > 0) {
          console.log("[Engine] Replaying scan-prep commands after bounce-back (deterministic)...");
          const { applied, failed } = replayScanPrep(repoPath, scanPrepReplayCommands);
          console.log(`[ScanPrep] Post-bounce replay: ${applied} applied, ${failed} failed`);
        } else {
          // No replay commands stored — fall back to full LLM re-run
          console.log("[Engine] Re-running scan-prep after bounce-back (no replay commands, using LLM)...");
          const rePrepResult = await prepareScanEnvironment(
            llm,
            repoPath,
            baseUrl,
            techStack,
            config.modelSelector.current(),
          );
          if (rePrepResult.completed && rePrepResult.changes.length > 0) {
            console.log(`[ScanPrep] Post-bounce re-run: ${rePrepResult.changes.length} change(s) applied`);
          } else {
            console.log("[ScanPrep] Post-bounce re-run: no changes needed");
          }
        }
      } catch (rePrepErr) {
        console.warn(`[Engine] Post-bounce scan-prep error: ${toErrorMessage(rePrepErr)} — continuing anyway`);
      } finally {
        healthMonitor?.resume();
      }
    }

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

    // Resolve hallucinated path params by probing list endpoints for real IDs
    const resolvedEndpoints = await resolvePathParams(safeEndpoints, baseUrl, authResult.directAuthHeaders);

    let registered = await registerEntrypoints(
      config,
      projectId,
      resolvedEndpoints,
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

    // Capture the FINAL known-good config — we've started the app, configured
    // auth, and registered live entrypoints, so everything here is proven to
    // work. Persisted to BRIGHT_STAR.md in the finally block.
    runMemory.techStack = techStack;
    runMemory.startup = startupConfig;
    runMemory.auth = authResult;
    runMemory.setupCompleted = setupCompleted;
    runMemory.setupCredentials = setupCredentials;
    runMemory.scanPrepReplayCommands = scanPrepReplayCommands;

    // ----- Validation mode: short-circuit the scan→fix→validate loop -----
    // Map CodeQL/SARIF findings to endpoints, run only the relevant DAST tests,
    // and emit a validated / not-validated / N-A verdict per finding. No fixes.
    if (config.runMode === "validation") {
      await runValidationFlow(
        ctx,
        progress,
        projectId,
        repeater.repeaterId,
        registered,
      );
      return;
    }

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
    let validationFindings: Finding[] = [];
    let lastFixModel = "";

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
            const restart = await restartApp(appProcess, llm, repoPath, techStack, startupConfig, config.modelSelector, authResult.registration, undefined, healthMonitor, authResult.seedCommands);
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
      const appAlive = await checkAppHealth(startupConfig.port, startupConfig.healthProbe ?? startupConfig.healthCheckPath);
      if (!appAlive) {
        console.warn(
          `[Scan] App is unreachable on port ${startupConfig.port} — restarting before scan`,
        );
        try {
          const restart = await restartApp(appProcess, llm, repoPath, techStack, startupConfig, config.modelSelector, authResult.registration, undefined, healthMonitor, authResult.seedCommands);
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

      const validationPlan =
        iteration > 0
          ? buildValidationScanPlan(validationFindings, registered, scanGroups)
          : undefined;
      const useTargetedValidation =
        !!validationPlan &&
        validationPlan.groups.length > 0 &&
        validationPlan.missed.length === 0;
      if (validationPlan && validationPlan.missed.length > 0) {
        console.warn(
          `[Scan] Could not map ${validationPlan.missed.length}/${validationFindings.length} finding(s) to targeted validation scans — falling back to full scan groups`,
        );
      }
      const roundScanGroups = useTargetedValidation
        ? validationPlan.groups
        : scanGroups;

      // --- Scan selected groups ---
      await progress.phaseStart(
        "scan",
        useTargetedValidation
          ? `Running targeted validation scans — round ${iteration + 1}`
          : `Running scans — round ${iteration + 1}`,
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
      if (useTargetedValidation) {
        console.log(
          `[Scan] Targeted validation: ${roundScanGroups.length} endpoint/test scan(s) for ${validationFindings.length} prior finding(s)`,
        );
      }
      for (const [gi, group] of roundScanGroups.entries()) {
        // Stagger scan launches to avoid overwhelming Bright's auth subsystem
        if (gi > 0) {
          const jitterMs = useTargetedValidation
            ? 5_000 + Math.floor(Math.random() * 5_000)
            : 30_000 + Math.floor(Math.random() * 30_000);
          console.log(`[Scan] Waiting ${Math.round(jitterMs / 1000)}s before launching ${useTargetedValidation ? "validation scan" : "group"} ${gi + 1}...`);
          await sleep(jitterMs);
        }
        try {
          const scanId = await runSecurityScan(
            projectId,
            group.entrypointIds,
            repeater.repeaterId,
            group.tests,
            config,
            useTargetedValidation
              ? `Engine Validation ${iteration + 1} — EP/Test ${gi + 1}`
              : `Engine Pass ${iteration + 1} — Group ${gi + 1}`,
            group.hasPathParams,
          );
          scanIds.push(scanId);
          allScanIds.push(scanId);
          activeScanIds.push(scanId);
          await progress.phaseDetail(
            "scan",
            "scan_launched",
            `${useTargetedValidation ? "Validation" : "Group"} ${gi + 1}: ${group.entrypointIds.length} endpoints · tests: ${group.tests.join(", ")}`,
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

      // Clear active scan tracking and resume any throttled scans
      activeScanIds.length = 0;
      if (pausedForThrottle.length > 0) {
        console.log(`[Scan] Resuming ${pausedForThrottle.length} throttled scan(s) now that the first batch completed`);
        for (const sid of pausedForThrottle) {
          await setScanLifecycle(config, sid, "resume").catch(() => {});
          activeScanIds.push(sid);
        }
        pausedForThrottle.length = 0;
        healthFlapCount = 0; // reset — give the app a fresh chance with lower load
      }

      if (failedCount > 0 && succeededScanIds.length === 0) {
        // All scans failed — nothing to harvest. Try to recover or abort.
        const stillAlive = await checkAppHealth(startupConfig.port, startupConfig.healthProbe ?? startupConfig.healthCheckPath);
        if (!stillAlive) {
          console.warn(
            "[Scan] App appears to have crashed during scanning — attempting restart and retry",
          );
          try {
            const restart = await restartApp(appProcess, llm, repoPath, techStack, startupConfig, config.modelSelector, authResult.registration, undefined, healthMonitor, authResult.seedCommands);
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
        const stillAlive = await checkAppHealth(startupConfig.port, startupConfig.healthProbe ?? startupConfig.healthCheckPath);
        if (!stillAlive) {
          console.warn(
            "[Scan] App appears to have crashed during scanning — attempting restart before processing findings",
          );
          try {
            const restart = await restartApp(appProcess, llm, repoPath, techStack, startupConfig, config.modelSelector, authResult.registration, undefined, healthMonitor, authResult.seedCommands);
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

      // Track all findings — mark previously-seen ones as fixed if they didn't reappear
      let roundFixedCount = 0;
      if (iteration > 0) {
        const currentKeys = new Set(findings.map(findingKey));
        const keysEligibleForFixMark = useTargetedValidation
          ? validationPlan.targetKeys
          : new Set(allFindings.keys());
        for (const key of keysEligibleForFixMark) {
          if (allFindings.has(key) && !currentKeys.has(key)) {
            fixedKeys.add(key);
            roundFixedCount++;
          }
        }
      }

      // Build scan-round detail with validation stats when available
      let scanDetail: string;
      if (iteration === 0) {
        scanDetail = findings.length > 0
          ? `Round ${iteration + 1} complete — ${findings.length} vulnerabilities found (${sevSummary})`
          : `Round ${iteration + 1} complete — no vulnerabilities found`;
      } else {
        const validated = (useTargetedValidation ? validationPlan.targetKeys : new Set(allFindings.keys())).size;
        scanDetail = `Round ${iteration + 1} validation — ${roundFixedCount}/${validated} fixed`;
        if (findings.length > 0) {
          scanDetail += `, ${findings.length} remaining (${sevSummary})`;
        }
      }
      await progress.phaseDetail("scan", "findings", scanDetail);
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
            : `All ${allFindings.size} vulnerabilities resolved after ${iteration + 1} round(s). ${allFixes.length} total fixes applied, ${fixedKeys.size}/${allFindings.size} validated.`;
        await progress.phaseStart("done", msg);
        return;
      }

      validationFindings = findings;

      // Escalate the model only when a fix actually FAILED — i.e. a finding we
      // already attempted in a prior round is still present. Fresh findings or
      // real progress keep us at the base (cheapest) model. This is the fix
      // loop's "start at base, escalate on failure" — it survives the
      // per-phase reset because "fix"/"scan" are loop phases (reset once).
      if (iteration > 0) {
        const persisted = findings.filter((f) => {
          const k = findingKey(f);
          return allFindings.has(k) && !fixedKeys.has(k);
        });
        if (persisted.length > 0) {
          if (config.modelSelector.escalate()) {
            console.log(
              `[Fix] ${persisted.length} finding(s) persisted after a prior fix attempt — escalating to ${config.modelSelector.current()}`,
            );
          }
        } else {
          config.modelSelector.reset();
        }
      }

      // Last iteration is validation-only
      if (iteration === MAX_ITERATIONS - 1) {
        buildSummaryTable(progress, allFindings, fixedKeys);
        await progress.phaseStart(
          "done",
          `Reached ${MAX_ITERATIONS} rounds. ${fixedKeys.size}/${allFindings.size} fixed, ${findings.length} remaining. ${allFixes.length} total fixes applied.`,
        );
        return;
      }

      // --- Fix findings one at a time (commit each, restart once after all) ---
      const fixModel = config.modelSelector.current();
      const escalated = iteration > 0 && fixModel !== lastFixModel;
      const modelNote = escalated ? ` ⬆ escalated` : "";
      await progress.phaseStart(
        "fix",
        `Fixing ${findings.length} vulnerabilities — round ${iteration + 1} (${fixModel}${modelNote})`,
      );
      lastFixModel = fixModel;

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

        // Auth-safety guard: if this fix touched auth-related files, verify
        // auth still works BEFORE committing. Fixes to auth guards, JWT
        // processors, login controllers etc. frequently break the working
        // auth flow. Catching it here (pre-commit) is cheap — we just revert
        // the working tree. Catching it post-commit requires bisect + rebuild.
        const AUTH_FILE_PATTERN = /auth|jwt|login|session|guard|token|credential|password|oauth|keycloak/i;
        const touchedAuthFile = fixes.some((f) =>
          f.files.some((fp) => AUTH_FILE_PATTERN.test(fp.path)),
        );
        if (touchedAuthFile && authResult.hasAuth && authResult.authObjectId && startupConfig.docker) {
          console.log(`[Fix] Fix touches auth-related file(s) — smoke-testing auth before commit...`);
          try {
            // Quick restart to pick up source changes (app runs from mounted source or needs rebuild)
            const qr = await quickRestartCompose(repoPath, startupConfig, 60_000);
            if (qr.ok) {
              const { testAuthObject } = await import("./phases/auth.js");
              const authCheck = await testAuthObject(config, authResult.authObjectId);
              if (!authCheck.passed) {
                console.warn(
                  `[Fix] Auth broke after applying fix for "${finding.name}" — reverting and skipping this fix`,
                );
                // Revert uncommitted changes
                try {
                  execFileSync("git", ["checkout", "--", "."], { cwd: repoPath, stdio: "pipe" });
                } catch { /* best effort */ }
                // Restart again with clean state
                await quickRestartCompose(repoPath, startupConfig, 60_000);
                skippedCount++;
                continue;
              }
              console.log(`[Fix] Auth smoke-test passed — safe to commit`);
            }
            // If quick restart failed, skip the auth check (full rebuild will verify later)
          } catch (authCheckErr) {
            console.warn(`[Fix] Auth smoke-test error: ${toErrorMessage(authCheckErr)} — proceeding with commit`);
          }
        }

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
          // Post-fix restart strategy: source files changed on the host, so
          // the Docker image must be rebuilt to pick up the patches. But we
          // don't need startApplicationWithRetries' full nuclear path (kill
          // everything, re-identify config, full rebuild from scratch) — the
          // app was already running with a known-good compose/Dockerfile.
          //
          // Escalation order:
          // 1. Incremental rebuild (docker compose up -d --build) — rebuilds
          //    the app image with cached layers, picks up source changes.
          //    Fast because base image + node_modules layer are cached.
          // 2. Full startApplicationWithRetries (nuclear — kills everything,
          //    re-identifies startup config, full rebuild from scratch). Only
          //    as last resort since it can hit unrelated issues.

          // Strategy 1: incremental rebuild
          if (startupConfig.docker) {
            console.log("[Fix] Rebuilding app image to pick up source fixes...");
            const composeFileMatch = startupConfig.command.match(/-f\s+(\S+)/);
            const composeFile = composeFileMatch?.[1] ?? "compose.yml";
            try {
              execFileSync(
                "docker",
                ["compose", "-f", composeFile, "up", "-d", "--build"],
                { cwd: repoPath, stdio: "pipe", timeout: 300_000 },
              );
              const probe = startupConfig.healthProbe ?? startupConfig.healthCheckPath ?? "/";
              if (await checkAppHealth(startupConfig.port, probe)) {
                console.log("[Fix] App healthy after incremental rebuild");
                healthy = true;
              }
            } catch (buildErr) {
              console.warn(`[Fix] Incremental rebuild failed: ${toErrorMessage(buildErr)}`);
            }
          }

          // Strategy 2: full restart (last resort)
          if (!healthy) {
            console.log("[Fix] Incremental rebuild failed — falling back to full startApplicationWithRetries");
            const restart = await restartApp(appProcess, llm, repoPath, techStack, startupConfig, config.modelSelector, authResult.registration, undefined, healthMonitor, authResult.seedCommands);
            appProcess = restart.process;
            healthy = true;
          }
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
            const restart = await restartApp(undefined, llm, repoPath, techStack, startupConfig, config.modelSelector, authResult.registration, undefined, healthMonitor, authResult.seedCommands);
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
              const restart = await restartApp(undefined, llm, repoPath, techStack, startupConfig, config.modelSelector, authResult.registration, undefined, healthMonitor, authResult.seedCommands);
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
        `Round ${iteration + 1}: ${fixedCount} fix(es) applied, ${skippedCount} skipped — model: ${fixModel}`,
      );
    }
  } finally {
    // End the last tracked phase and print final token analytics
    TokenTracker.global().endPhase();
    TokenTracker.global().logFinalReport();

    // Always publish the summary table — ensures ROI even on failure
    buildSummaryTable(progress, allFindings, fixedKeys);
    await progress.updatePrDescription();

    // Persist run memory (BRIGHT_STAR.md) — only when we reached a proven-good
    // state (app started + entrypoints registered). Holds only what works.
    if (runMemory.startup) {
      try {
        const star = await assembleBrightStar({
          techStack: runMemory.techStack,
          startup: runMemory.startup,
          auth: runMemory.auth,
          setup: runMemory.setupCompleted !== undefined
            ? { completed: runMemory.setupCompleted, credentials: runMemory.setupCredentials }
            : undefined,
          scanPrepReplayCommands: runMemory.scanPrepReplayCommands,
          endpointNotes: runMemory.endpointNotes,
          api: config,
        });
        // Skip rewrite if the meaningful content is unchanged (ignore timestamp).
        if (!brightStarEquivalent(loadedBrightStar, star)) {
          writeBrightStar(repoPath, star);
          gitFinalizeChanges(repoPath, "chore: update BRIGHT_STAR.md run memory");
          console.log("[BrightStar] Wrote BRIGHT_STAR.md run memory");
        } else {
          console.log("[BrightStar] Run memory unchanged — keeping existing BRIGHT_STAR.md");
        }
      } catch (err) {
        console.warn(`[BrightStar] Failed to persist run memory: ${toErrorMessage(err)}`);
      }
    }

    // Stop the health monitor before tearing things down so it doesn't
    // try to recover an app we're about to kill.
    if (healthMonitor) healthMonitor.stop();

    // Cleanup
    await killProcess(appProcess);
    await repeater?.stop();

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
// ---------------------------------------------------------------------------
// Validation mode: map SARIF/CodeQL findings to endpoints, run targeted DAST
// scans, and emit a verdict per finding. No fix loop.
// ---------------------------------------------------------------------------
async function runValidationFlow(
  ctx: OrchestratorContext,
  progress: ProgressReporter,
  projectId: string,
  repeaterId: string,
  registered: RegisteredEntrypoint[],
): Promise<void> {
  const { llm, config } = ctx;

  await progress.phaseStart(
    "validation",
    "Validating CodeQL findings against live DAST scans",
  );

  if (!config.sarifPath) {
    await progress.phaseStart("done", "Validation mode requires SARIF_PATH.");
    return;
  }

  // Parse SARIF, then let the AI map each CodeQL rule to a Bright test using
  // the LIVE test catalog (not a hardcoded table) so we don't wrongly flag
  // dynamically-testable classes (XXE, code injection, redirects, …) as N/A.
  const sarifFindings = parseSarif(config.sarifPath);
  console.log(`[Validation] Parsed ${sarifFindings.length} finding(s) from SARIF`);

  let catalog: Awaited<ReturnType<typeof listTests>> = [];
  try {
    catalog = await listTests(config);
    await resolveBrightTests(llm, sarifFindings, catalog, config.modelSelector.current());
  } catch (err) {
    console.warn(`[Validation] Test-catalog mapping failed, using static map: ${toErrorMessage(err)}`);
  }

  const mappableCount = sarifFindings.filter((f) => f.brightTest !== null).length;
  console.log(
    `[Validation] ${mappableCount} mappable to DAST tests, ${sarifFindings.length - mappableCount} N/A (no DAST equivalent)`,
  );
  await progress.phaseDetail(
    "validation",
    "parsed",
    `${sarifFindings.length} findings (${mappableCount} DAST-testable)`,
  );

  // Correlate mappable findings to registered endpoints.
  const mapped = await mapFindingsToEndpoints(
    llm,
    sarifFindings,
    registered,
    config.modelSelector.current(),
    ctx.repoPath,
  );
  await progress.phaseDetail(
    "validation",
    "mapped",
    `Mapped ${mapped.length} finding(s) to endpoints`,
  );

  // Detect path-param endpoints for correct attack-location selection.
  const hasPathParams = registered.some((r) => /[{:]/.test(r.endpoint.path));

  // Run targeted scans + build verdicts. Scanning is a separate phase so its
  // (LLM-free) duration is attributed to "scan" rather than inflating the
  // "validation" phase's mapping/tracing time.
  await progress.phaseStart(
    "scan",
    "Running targeted DAST scans for mapped findings",
  );
  const results = await runValidationScans(
    config,
    projectId,
    repeaterId,
    registered,
    sarifFindings,
    mapped,
    hasPathParams,
    llm,
    config.modelSelector.current(),
    catalog,
  );

  const report = formatValidationReport(results);
  console.log(report);

  // Publish the CodeQL → DAST validation table to the PR.
  progress.setValidationSummary(toValidationSummaryRows(results));

  const { validated, notValidated, notApplicable } = summarizeResults(results);
  await progress.phaseStart(
    "done",
    `Validation complete: ${validated.length} validated, ${notValidated.length} not validated, ${notApplicable.length} N/A`,
  );
}

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
    let registered = await registerEntrypoints(
      config,
      projectId,
      harnessResult.endpoints,
      baseUrl,
      repeater.repeaterId,
      undefined, // no auth
    );
    registered = await pruneDeadEntrypoints(config, projectId, registered, {
      pruneFailedResponses: true,
    });
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
      // Stagger scan launches to avoid overwhelming Bright's auth subsystem
      if (gi > 0) {
        const jitterMs = 30_000 + Math.floor(Math.random() * 30_000);
        console.log(`[Scan] Waiting ${Math.round(jitterMs / 1000)}s before launching harness group ${gi + 1}...`);
        await sleep(jitterMs);
      }
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
    TokenTracker.global().endPhase();
    TokenTracker.global().logFinalReport();
    await repeater.stop();
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

/**
 * True if two BrightStar snapshots are equivalent ignoring the generatedAt
 * timestamp — used to avoid rewriting/committing BRIGHT_STAR.md when nothing
 * meaningful changed between runs.
 */
function brightStarEquivalent(a: BrightStar | null, b: BrightStar | null): boolean {
  if (!a || !b) return false;
  const norm = (s: BrightStar) => JSON.stringify({ ...s, generatedAt: "" });
  return norm(a) === norm(b);
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

function isAuthRateLimitHint(hint: string | undefined): boolean {
  if (!hint) return false;
  return /\b(?:429|too\s*many\s*requests|rate[-\s]?limit|rate\s*limiting|throttle|throttling|brute|lockout|login attempt)\b/i.test(hint);
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

  // Capture git diff to show the LLM exactly what changed
  let gitDiff = "";
  let gitStatus = "";
  try {
    const commitCount = appliedFixes.length;
    gitDiff = execFileSync(
      "git", ["diff", `HEAD~${commitCount}`, "--stat", "--patch"],
      { cwd: repoPath, encoding: "utf-8", maxBuffer: 50 * 1024 },
    ).slice(0, 6000);
  } catch { /* ignore */ }
  try {
    gitStatus = execFileSync(
      "git", ["status", "--short"],
      { cwd: repoPath, encoding: "utf-8" },
    ).slice(0, 2000);
  } catch { /* ignore */ }

  const messages: Parameters<typeof chatWithTools>[1] = [
    {
      role: "system",
      content: `You are a senior developer debugging a build/runtime failure.
The application (${stackStr}) was working before security fixes were applied, but now it fails to start.
You have tools to read files, list directories, and search the codebase.

Your job: analyze the container logs and the git diff below, identify what the fixes broke, and produce corrected files.

IMPORTANT RULES:
- If a fix modified an infrastructure/config file (Dockerfile, docker-compose.yml, .env, *.conf.py, nginx.conf, etc.) that broke the app, REVERT that file to its original content. Use \`git show HEAD~N:path/to/file\` to get the original.
- Security fixes should ONLY modify application source code, not infrastructure files.
- If the fix introduced a syntax error, import error, or logic error in source code, fix it while preserving the security improvement where possible.
- If you cannot fix the source code without breaking the security fix, revert the file entirely.`,
    },
    {
      role: "user",
      content: `The following security fixes were just applied, and now the application won't start:

${fixSummary}

Git diff showing all changes:
\`\`\`
${gitDiff || "(could not capture git diff)"}
\`\`\`

Git status:
\`\`\`
${gitStatus || "(clean)"}
\`\`\`

Container logs showing the error:
\`\`\`
${containerLogs.slice(0, 4000)}
\`\`\`

Please:
1. Read the files that were modified by the fixes (use the tools)
2. Check \`git show HEAD~${appliedFixes.length}:path/to/file\` to see the original content if needed
3. Identify the error introduced by the fixes
4. If an infrastructure file was modified (Dockerfile, *.conf.py, compose files, etc.), revert it to the original
5. For source code files, fix the error while preserving the security improvement

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
