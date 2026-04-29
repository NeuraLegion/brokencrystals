import type OpenAI from "openai";
import {
  spawn,
  execSync,
  execFileSync,
  type ChildProcess,
} from "child_process";
import { createInterface } from "readline";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import type { TechStack, StartupConfig, ProjectDiscovery } from "../types.js";
import { chatWithTools, type ModelSelector, type ToolHandler } from "../inference.js";
import {
  codebaseTools,
  createToolHandler,
  dockerfileTools,
  createDockerfileToolHandler,
  fixDockerfileImages,
  infraTools,
  createInfraToolHandler,
  verifyDockerImageTool,
  webSearchTools,
  createWebSearchHandler,
} from "../tools.js";
import { sleep, formatTechStack, toErrorMessage, toDetailedErrorMessage, extractJson, extractCodeBlock, stripHtmlForAnalysis, FETCH_TIMEOUT_QUICK, FETCH_TIMEOUT_SHORT, FETCH_TIMEOUT_MEDIUM } from "../utils.js";
import {
  identifyStartupPrompt,
  rebuildStartupPrompt,
  retryStartupPrompt,
} from "../prompts/identify-startup.js";
import { generateDockerfilePrompt } from "../prompts/generate-dockerfile.js";
import { discoverProjectPrompt } from "../prompts/discover-project.js";
import { generateComposePrompt } from "../prompts/generate-compose.js";

const MAX_STARTUP_ATTEMPTS = parseInt(process.env.MAX_STARTUP_ATTEMPTS ?? "15", 10);

/** Intentional startup failure — must always propagate through catch blocks. */
class StartupFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StartupFailedError";
  }
}

/** Per-attempt stats for debugging startup failures */
interface AttemptStat {
  attempt: number;
  strategy: string;
  command: string;
  model?: string;
  durationMs: number;
  result: "success" | "build_error" | "timeout" | "crash" | "compilation" | "error";
  errorSummary?: string;
}

function printStartupStats(stats: AttemptStat[]): void {
  const total = stats.reduce((s, a) => s + a.durationMs, 0);
  console.log(`\n[Startup] ===== Startup Statistics =====`);
  console.log(`[Startup] Total attempts: ${stats.length}/${MAX_STARTUP_ATTEMPTS}`);
  console.log(`[Startup] Total time: ${(total / 1000).toFixed(1)}s`);
  for (const s of stats) {
    const dur = (s.durationMs / 1000).toFixed(1);
    const model = s.model ? ` [${s.model}]` : "";
    console.log(
      `[Startup]   #${s.attempt} ${s.strategy}${model} → ${s.result} (${dur}s) — ${s.command.slice(0, 80)}`,
    );
    if (s.errorSummary) {
      console.log(`[Startup]      error: ${s.errorSummary.slice(0, 150)}`);
    }
  }
  console.log(`[Startup] ================================\n`);
}

/**
 * Detect build errors caused by source code compilation failures
 * (not Dockerfile/infra issues). These can't be fixed by repairing the
 * Dockerfile, so we should stop retrying immediately.
 *
 * Only triggers when we see the SAME compilation error pattern on
 * consecutive attempts — the first occurrence might be a Dockerfile issue
 * (e.g. missing COPY for source dirs) that the repair can fix.
 */
function isSourceCodeError(
  errorMsg: string,
  previousErrors: string[],
): boolean {
  // OOM errors are fixable by Dockerfile repair (adding -Xmx flags) — never bail on them
  if (/OutOfMemoryError|out of memory/i.test(errorMsg)) return false;

  // Runtime config errors are fixable by Dockerfile repair (adjusting CMD flags)
  if (/FileNotFoundException.*conf\//i.test(errorMsg)) return false;

  // tsc with --noEmitOnError exits non-zero but the fix is just || true — not a source code issue
  if (/--noEmitOnError/.test(errorMsg)) return false;

  const patterns = [
    // Scala / sbt
    /Compilation failed/,
    // Java / Maven / Gradle
    /BUILD FAILURE/,
    /COMPILATION ERROR/,
    // .NET / C#
    /Build FAILED\./,
    /error CS\d{4}:/,
    // Go
    /build constraints exclude all Go files/,
    // Rust
    /error\[E\d{4}\]:/,
    /could not compile/,
    // TypeScript / JavaScript
    /error TS\d{4}:/,
    // Python
    /SyntaxError: invalid syntax/,
    // Generic: high error count
    /\d{2,}\s+errors?\s+(found|generated|reported)/i,
  ];

  const isCompilationError = patterns.some((p) => p.test(errorMsg));
  if (!isCompilationError) return false;

  // First time seeing a compilation error — let repair try (might be a COPY issue)
  // Only bail if a previous attempt also had a compilation error
  return previousErrors.some((prev) =>
    patterns.some((p) => p.test(prev)),
  );
}

/**
 * Check whether the repository has the files needed to build from source
 * (Dockerfile, docker-compose, package.json, etc.). If we can only run
 * from a pre-built remote image, fixes will never take effect.
 */
export function canBuildFromSource(repoPath: string): boolean {
  // A source-building Dockerfile is a strong signal
  if (findDockerfile(repoPath)) return true;

  // Exact filenames at the repo root (non-Dockerfile build systems)
  const buildIndicators = [
    "docker-compose.yml",
    "compose.yml",
    "docker-compose.local.yml",
    "compose.local.yml",
    "docker-compose.dev.yml",
    "compose.dev.yml",
    "package.json",
    "Makefile",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "Cargo.toml",
    "go.mod",
    "Gemfile",
    "requirements.txt",
    "pyproject.toml",
    "setup.py",
    "CMakeLists.txt",
    "meson.build",
  ];
  if (buildIndicators.some((f) => existsSync(`${repoPath}/${f}`))) return true;

  // Glob patterns for build systems that use varying filenames (.sln, .csproj, .fsproj, etc.)
  try {
    const entries = execSync("ls -1", {
      cwd: repoPath,
      encoding: "utf-8",
      timeout: 5_000,
    }).split("\n");
    const globPatterns = [
      /\.sln$/i,
      /\.csproj$/i,
      /\.fsproj$/i,
      /\.vbproj$/i,
      /\.cabal$/i,
      /\.pro$/i,
    ];
    if (entries.some((e) => globPatterns.some((p) => p.test(e.trim()))))
      return true;
  } catch {
    /* ignore */
  }

  return false;
}

// ---------------------------------------------------------------------------
// Dockerfile detection & validation
// ---------------------------------------------------------------------------

/** Name we use for Dockerfiles WE generate (never overwrites user files). */
const BRIGHT_DOCKERFILE = "Dockerfile.bright";

/**
 * Check whether a Dockerfile actually builds from local source code.
 * Returns false for pull-only Dockerfiles (e.g. `FROM registry/app:latest`
 * with no COPY/ADD of source — these won't reflect local code changes).
 */
function dockerfileBuildsFromSource(content: string): boolean {
  const lines = content.split("\n").map((l) => l.trim());
  // Must have at least one COPY or ADD that copies local source
  // (skip COPY --from= which is multi-stage, and ADD of URLs)
  const copiesSource = lines.some(
    (l) =>
      (/^COPY\s/i.test(l) && !/^COPY\s+--from=/i.test(l)) ||
      (/^ADD\s/i.test(l) && !/^ADD\s+https?:/i.test(l)),
  );
  return copiesSource;
}

/**
 * Find a usable Dockerfile in the repo that builds from source.
 *
 * Priority:
 * 1. `Dockerfile.bright` — our previously generated file (always builds from source)
 * 2. `Dockerfile` / `dockerfile` — standard names, validated for source build
 * 3. `Dockerfile.*` variants — scored by name, validated for source build
 *
 * Returns the filename (relative to repoPath) or undefined if none found.
 */
export function findDockerfile(repoPath: string): string | undefined {
  // 1. Our own generated Dockerfile always takes priority
  if (existsSync(`${repoPath}/${BRIGHT_DOCKERFILE}`))
    return BRIGHT_DOCKERFILE;

  // 2. Standard names
  for (const name of ["Dockerfile", "dockerfile"]) {
    const path = `${repoPath}/${name}`;
    if (!existsSync(path)) continue;
    try {
      if (dockerfileBuildsFromSource(readFileSync(path, "utf-8"))) return name;
      console.log(`[Startup] ${name} found but only pulls a remote image — skipping`);
    } catch { /* unreadable */ }
  }

  // 3. Scan for Dockerfile.* variants
  let variants: string[];
  try {
    variants = readdirSync(repoPath).filter(
      (f) => /^Dockerfile\./i.test(f) && f !== BRIGHT_DOCKERFILE,
    );
  } catch {
    return undefined;
  }
  if (variants.length === 0) return undefined;

  // Score variants: prefer production/web/app, avoid test/ci/integration
  const preferred = [/prod/i, /web/i, /app/i, /debian/i, /alpine/i];
  const avoid = [/test/i, /ci/i, /lint/i, /integration/i, /dev\b/i];
  const scored = variants
    .map((f) => {
      let score = 0;
      for (const p of preferred) if (p.test(f)) score += 10;
      for (const a of avoid) if (a.test(f)) score -= 20;
      return { f, score };
    })
    .sort((a, b) => b.score - a.score);

  for (const { f } of scored) {
    try {
      if (dockerfileBuildsFromSource(readFileSync(`${repoPath}/${f}`, "utf-8")))
        return f;
      console.log(`[Startup] ${f} found but only pulls a remote image — skipping`);
    } catch { /* unreadable */ }
  }

  return undefined;
}

export interface StartupResult {
  process: ChildProcess;
  config: StartupConfig;
  /** Post-start setup hints from discovery (e.g. "App has a first-run setup wizard") */
  postStartSetupHints?: string[];
}

// ---------------------------------------------------------------------------
// Project discovery — LLM-based infrastructure analysis
// ---------------------------------------------------------------------------

/**
 * Run the LLM project discovery phase: explore the codebase to identify
 * required services, config patches, env vars, and build notes.
 * This runs ONCE before the attempt loop to inform Dockerfile + compose generation.
 */
async function discoverProject(
  llm: OpenAI,
  repoPath: string,
  stackStr: string,
  model?: string,
): Promise<ProjectDiscovery | undefined> {
  console.log("[Startup] Running project discovery — analyzing infrastructure requirements...");
  const t0 = Date.now();

  try {
    const messages = discoverProjectPrompt(stackStr);
    const baseHandler = createDockerfileToolHandler(repoPath);
    const webHandler = createWebSearchHandler(repoPath);
    const handler: ToolHandler = async (name, args) => {
      if (name === "search_web" || name === "fetch_url") {
        return webHandler(name, args);
      }
      return baseHandler(name, args);
    };
    const response = await chatWithTools(
      llm,
      messages,
      [...codebaseTools, ...webSearchTools, verifyDockerImageTool],
      handler,
      model,
    );
    const jsonStr = extractJson(response);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.warn("[Startup] Discovery returned unparseable JSON — skipping");
      return undefined;
    }

    if (!parsed || !Array.isArray(parsed.services)) {
      console.warn("[Startup] Discovery returned invalid structure — skipping");
      return undefined;
    }

    const discovery: ProjectDiscovery = {
      services: (parsed.services ?? []).map((s: Record<string, unknown>) => ({
        name: String(s.name ?? ""),
        image: String(s.image ?? ""),
        reason: String(s.reason ?? ""),
        environment: s.environment as Record<string, string> | undefined,
        port: typeof s.port === "number" ? s.port : undefined,
      })).filter((s: { name: string; image: string }) => s.name && s.image),
      configNotes: Array.isArray(parsed.configNotes) ? parsed.configNotes.map(String) : [],
      appEnvironment: typeof parsed.appEnvironment === "object" && parsed.appEnvironment ? parsed.appEnvironment as Record<string, string> : {},
      buildNotes: Array.isArray(parsed.buildNotes) ? parsed.buildNotes.map(String) : [],
      port: typeof parsed.port === "number" ? parsed.port : 3000,
      healthCheckPath: typeof parsed.healthCheckPath === "string" ? parsed.healthCheckPath : undefined,
      postStartSetup: Array.isArray(parsed.postStartSetup) ? parsed.postStartSetup.map(String) : undefined,
    };

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[Startup] Discovery completed in ${elapsed}s:`);
    console.log(`[Startup]   Services: ${discovery.services.map(s => `${s.name} (${s.image})`).join(", ") || "none"}`);
    if (discovery.configNotes.length) {
      console.log(`[Startup]   Config notes: ${discovery.configNotes.length} items`);
    }
    if (discovery.buildNotes.length) {
      console.log(`[Startup]   Build notes: ${discovery.buildNotes.length} items`);
    }
    if (discovery.postStartSetup?.length) {
      console.log(`[Startup]   Post-start setup: ${discovery.postStartSetup.length} steps`);
    }
    console.log(`[Startup]   Port: ${discovery.port}, Health: ${discovery.healthCheckPath ?? "/"}`);

    return discovery;
  } catch (err) {
    console.warn(`[Startup] Discovery failed (${toErrorMessage(err)}) — continuing without it`);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// LLM-based Docker Compose generation
// ---------------------------------------------------------------------------

/**
 * Generate a compose.yml using LLM + project discovery results.
 * Falls back to the simple template if the LLM fails.
 */
async function generateComposeWithLLM(
  llm: OpenAI,
  repoPath: string,
  stackStr: string,
  discovery: ProjectDiscovery,
  config: StartupConfig,
  model?: string,
  hints?: string[],
): Promise<void> {
  const MAX_COMPOSE_GEN_RETRIES = 3;
  const t0 = Date.now();

  for (let attempt = 1; attempt <= MAX_COMPOSE_GEN_RETRIES; attempt++) {
    console.log(`[Startup] Generating compose.yml with LLM (attempt ${attempt}/${MAX_COMPOSE_GEN_RETRIES})...`);
    try {
      const dfName = findDockerfile(repoPath);
      const hasDockerfile = !!dfName;
      const messages = generateComposePrompt(stackStr, discovery, hasDockerfile, hints, dfName);
      const handler = createToolHandler(repoPath);
      const response = await chatWithTools(llm, messages, codebaseTools, handler, model);
      const content = extractCodeBlock(response);

      if (!content || content.length < 20) {
        throw new Error("LLM returned empty or too-short compose content");
      }

      writeFileSync(`${repoPath}/compose.yml`, content);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const serviceCount = (content.match(/^\s+\w+:/gm) ?? []).length;
      console.log(`[Startup] Generated compose.yml in ${elapsed}s (${serviceCount} top-level keys, ${content.split("\n").length} lines)`);
      return; // success — done
    } catch (err) {
      console.warn(`[Startup] LLM compose generation attempt ${attempt} failed: ${toErrorMessage(err)}`);
      if (attempt < MAX_COMPOSE_GEN_RETRIES) {
        console.log(`[Startup] Retrying compose generation...`);
      }
    }
  }

  // All retries exhausted — fall back to template
  console.warn(`[Startup] All ${MAX_COMPOSE_GEN_RETRIES} compose generation attempts failed — using template fallback`);
  generateComposeFile(repoPath, config);
}

export async function startApplicationWithRetries(
  llm: OpenAI,
  repoPath: string,
  techStack: TechStack,
  previousStartup?: StartupConfig,
  modelSelector?: ModelSelector,
  externalHints?: string[],
): Promise<StartupResult> {
  // Clean up any running Docker containers to avoid port conflicts
  cleanupDocker(repoPath);

  const stackStr = formatTechStack(techStack);
  const attemptErrors: Array<{ config: StartupConfig; error: string }> = [];
  const startupHints: string[] = [];
  const stats: AttemptStat[] = [];
  let dockerfileRepaired = false;
  let infraRepaired = false;
  // Summaries of what each prior repair LLM did + a fingerprint of the error
  // they were trying to fix. Used to detect "repair didn't break the loop"
  // and to give the next repair LLM context about what's already been tried.
  const repairHistory: Array<{ kind: "build" | "infra"; summary: string; targetErrorFp: string }> = [];

  // Run project discovery ONCE before the attempt loop (skip for rebuilds — we already know what works)
  let discovery: ProjectDiscovery | undefined;
  if (!previousStartup) {
    discovery = await discoverProject(llm, repoPath, stackStr, modelSelector?.current());
  }

  // Seed startupHints from discovery findings so repair LLMs inherit them
  if (discovery) {
    for (const note of discovery.configNotes) {
      startupHints.push(`[discovery] ${note}`);
    }
    for (const note of discovery.buildNotes) {
      startupHints.push(`[discovery] ${note}`);
    }
    for (const step of discovery.postStartSetup ?? []) {
      startupHints.push(`[discovery] Post-start: ${step}`);
    }
    for (const svc of discovery.services) {
      startupHints.push(`[discovery] Service "${svc.name}" requires image: ${svc.image} — ${svc.reason}`);
    }
    if (startupHints.length > 0) {
      console.log(`[Startup] Seeded ${startupHints.length} hints from discovery`);
    }
  }

  // Inject external hints (e.g. from auth infra bounce-back)
  if (externalHints?.length) {
    for (const hint of externalHints) {
      startupHints.push(hint);
    }
    console.log(`[Startup] Injected ${externalHints.length} external hint(s)`);
  }

  for (let attempt = 1; attempt <= MAX_STARTUP_ATTEMPTS; attempt++) {
    const attemptStart = Date.now();
    let config: StartupConfig;
    let strategy: string;

    if (attempt === 1 && previousStartup) {
      strategy = "rebuild";
      console.log("[Startup] Strategy: rebuild (source changed)");
      config = await rebuildStartupConfig(
        llm,
        repoPath,
        stackStr,
        previousStartup,
        modelSelector?.current(),
      );
    } else if (attempt === 1) {
      strategy = "initial";
      console.log("[Startup] Strategy: initial identification");
      config = await identifyStartupConfig(
        llm,
        repoPath,
        stackStr,
        modelSelector?.current(),
      );
    } else {
      // Escalate model on retry if available
      modelSelector?.escalate();

      // If the Dockerfile or infra was repaired, retry with the same config
      if (dockerfileRepaired || infraRepaired) {
        const prev = attemptErrors[attemptErrors.length - 1];
        strategy = dockerfileRepaired ? "retry-after-dockerfile-repair" : "retry-after-infra-repair";
        console.log(`[Startup] ${dockerfileRepaired ? "Dockerfile" : "Infrastructure"} was repaired — retrying same config`);
        config = prev.config;
        dockerfileRepaired = false;
        infraRepaired = false;
      } else {
        strategy = "llm-retry";
        console.log("[Startup] Strategy: asking LLM for new approach after failure");
        const prev = attemptErrors[attemptErrors.length - 1];
        config = await retryStartupConfig(
          llm,
          repoPath,
          stackStr,
          prev.config,
          prev.error,
          attempt,
          modelSelector?.current(),
          attemptErrors.map((a) => ({
            config: JSON.stringify(a.config, null, 2),
            error: a.error,
          })),
          startupHints,
        );
      }
    }

    // If the LLM chose native but required tools aren't on host, switch to Docker
    if (!config.docker) {
      config = ensureToolsAvailable(repoPath, config);
    }

    // Guardrail: Docker config must include a build-from-source step.
    // If the LLM returned a pre-built image approach, force docker build.
    if (config.docker && !configBuildsFromSource(config)) {
      console.warn(
        `[Startup] Config uses pre-built image without build step — forcing docker build from source`,
      );
      const imageName = "bright-app-local";
      const df = findDockerfile(repoPath);
      const fFlag = df && df !== "Dockerfile" ? `-f ${df} ` : "";
      config = {
        command: `docker run --name ${imageName} -p ${config.port}:${config.port} -d ${imageName}`,
        port: config.port,
        prerequisites: [`docker build ${fFlag}-t ${imageName} .`.trim()],
        envVars: config.envVars,
        docker: true,
      };
    }

    // Guardrail: If docker config's command uses tools that only exist
    // inside the container (bundle, rails, python, cargo, etc.) without
    // being wrapped in docker run/exec, auto-wrap it so it runs in the image.
    if (config.docker && !commandRunsInDocker(config.command)) {
      const imageName = extractImageName(config) ?? "discourse-local";
      console.warn(
        `[Startup] Command "${config.command.slice(0, 60)}" is not wrapped in docker run — auto-wrapping for image ${imageName}`,
      );
      config = {
        ...config,
        command: `docker run --name ${imageName} -p ${config.port}:${config.port} -d ${imageName} ${config.command}`,
      };
    }

    // Guardrail: If discovery found companion services (DB, Redis, etc.)
    // and the LLM chose standalone docker run instead of docker compose,
    // force compose mode. Standalone docker run cannot provide the
    // networking and service dependencies the app needs.
    const usesComposeAlready = /docker\s+compose/.test(
      [...(config.prerequisites ?? []), config.command].join(" "),
    );
    if (discovery && discovery.services.length > 0 && config.docker && !usesComposeAlready) {
      const serviceNames = discovery.services.map(s => s.name).join(", ");
      console.warn(
        `[Startup] App needs companion services (${serviceNames}) but config uses standalone docker — forcing compose mode`,
      );
      config = {
        ...config,
        command: `docker compose up -d`,
        prerequisites: ["docker compose build"],
      };
    }

    // Guardrail: If command is docker compose, sanitize prerequisites:
    // 1. Remove "docker run -d" — conflicts by binding the same ports.
    // 2. Move "docker compose exec" commands to postStartCommands —
    //    exec requires a running container, but prerequisites run
    //    BEFORE "docker compose up".
    if (/docker\s+compose/.test(config.command) && config.prerequisites?.length) {
      const original = config.prerequisites;
      const movedToPostStart: string[] = [];
      const cleaned = original.flatMap(cmd =>
        cmd.split(/\s*&&\s*/).map(part => {
          const trimmed = part.trim();
          if (/docker\s+run\s/.test(trimmed) && /\s-d[\s$]/.test(trimmed)) {
            console.warn(`[Startup] Removing conflicting prerequisite: ${trimmed.slice(0, 80)}`);
            return "";
          }
          // exec needs a running container → move to postStartCommands
          if (/docker\s+compose\s+exec\b/.test(trimmed) || /docker\s+exec\b/.test(trimmed)) {
            console.log(`[Startup] Moving exec prerequisite to post-start: ${trimmed.slice(0, 80)}`);
            movedToPostStart.push(trimmed);
            return "";
          }
          return trimmed;
        }).filter(p => p.length > 0)
      ).filter(cmd => cmd.length > 0);
      if (movedToPostStart.length > 0 || cleaned.join("") !== original.join("")) {
        const existingPostStart = config.postStartCommands ?? [];
        // Prepend moved commands so they run before any existing post-start cmds
        config = {
          ...config,
          prerequisites: cleaned,
          postStartCommands: [...movedToPostStart, ...existingPostStart],
        };
        if (movedToPostStart.length) {
          console.log(`[Startup] Moved ${movedToPostStart.length} exec command(s) from prerequisites to post-start`);
        }
        if (cleaned.length < original.length) {
          console.log(`[Startup] Cleaned prerequisites: ${cleaned.map(c => c.slice(0, 60)).join(" ; ") || "(none)"}`);
        }
      }
    }

    // Ensure a usable Dockerfile exists when Docker-based startup is requested
    const existingDockerfile = config.docker ? findDockerfile(repoPath) : undefined;
    if (config.docker && !existingDockerfile) {
      console.log(
        "[Startup] No source-building Dockerfile found — generating one for this project",
      );
      await generateDockerfile(
        llm,
        repoPath,
        stackStr,
        modelSelector?.current(),
        discovery,
      );
    }
    // Resolved Dockerfile name for this attempt (existing or freshly generated)
    const dockerfileName = findDockerfile(repoPath) ?? "Dockerfile";
    if (dockerfileName !== "Dockerfile") {
      console.log(`[Startup] Using Dockerfile: ${dockerfileName}`);
    }

    // Ensure a compose file exists when docker compose commands are used
    const usesCompose = /docker\s+compose/.test(
      [...(config.prerequisites ?? []), config.command].join(" "),
    );
    if (usesCompose && !findComposeFile(repoPath)) {
      if (discovery && discovery.services.length > 0) {
        await generateComposeWithLLM(llm, repoPath, stackStr, discovery, config, modelSelector?.current(), startupHints);
      } else {
        console.log("[Startup] No compose file found — generating one from Dockerfile (no discovery available)");
        generateComposeFile(repoPath, config);
      }
    }

    console.log(
      `[Startup] Attempt ${attempt}/${MAX_STARTUP_ATTEMPTS}: ${config.docker ? "Docker" : "native"} — ${config.command}`,
    );
    if (config.prerequisites?.length) {
      console.log(`[Startup]   prerequisites: ${config.prerequisites.join(" && ")}`);
    }
    if (config.postStartCommands?.length) {
      console.log(`[Startup]   post-start: ${config.postStartCommands.join(" && ")}`);
    }
    if (config.envVars && Object.keys(config.envVars).length) {
      console.log(`[Startup]   env: ${Object.keys(config.envVars).join(", ")}`);
    }
    console.log(`[Startup]   port: ${config.port}`);
    if (config.healthCheckPath) {
      console.log(`[Startup]   health-check: ${config.healthCheckPath}`);
    }

    try {
      // Create LLM-powered log analyzer for health check waits
      const analyzeLogsFn: LogAnalyzer = async (logs: string, ctx) => {
        const ctxBlock = ctx
          ? `\n\nReachability context (CRITICAL — use this to detect lying logs):
- Host-side port ${ctx.port} reachable: ${ctx.hostPortReachable ? "YES (got HTTP response at least once)" : "NO (never responded)"}
- Consecutive connection failures from host: ${ctx.consecutiveConnFailures}
- Seconds waiting for port: ${ctx.secondsWaiting}

If logs claim the server is "listening on ${ctx.port}" but the host has NEVER reached the port and many seconds have passed, this is almost certainly a binding/port-mapping problem (server bound to 127.0.0.1 inside the container, wrong "ports:" entry in compose, or the framework is listening on a different port than declared). Return "fatal" with a clear summary in that case — extending the timeout will not help.`
          : "";
        const resp = await llm.chat.completions.create({
          model: modelSelector?.current() ?? "gpt-4o-mini",
          max_completion_tokens: 200,
          messages: [
            {
              role: "system",
              content: `You are analyzing Docker container logs during application startup. Determine if the app is making progress toward being ready or if there's a fatal error that will never resolve.

Respond with EXACTLY one JSON object:
{"status": "progress" | "fatal" | "unknown", "summary": "<one sentence>"}

- "progress": logs show active work — migrations running, assets compiling, dependencies installing, database seeding, server starting up — AND host-side port is either reachable already or we're still in the early startup window
- "fatal": logs show an unrecoverable error — connection refused to a required service, missing database, permission denied, syntax error, crash loop, OR the server claims to be listening but the host cannot reach the port after a substantial wait (binding/port-mapping mismatch — see reachability context below)
- "unknown": can't tell from the logs`,
            },
            {
              role: "user",
              content: `Container logs (last 40 lines):\n\`\`\`\n${logs.slice(-3000)}\n\`\`\`${ctxBlock}`,
            },
          ],
        });
        try {
          const text = resp.choices[0]?.message.content ?? "";
          const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
          return {
            status: json.status === "progress" || json.status === "fatal" ? json.status : "unknown",
            summary: String(json.summary ?? "").slice(0, 200) || "no summary",
          };
        } catch {
          return { status: "unknown" as const, summary: "failed to parse AI response" };
        }
      };

      // Capture health check reason so we can pass it forward to auth detection
      let lastHealthReason = "";

      // Create LLM-powered HTTP response health analyzer
      const analyzeResponseFn = async (status: number, body: string): Promise<{ healthy: boolean; reason: string }> => {
        const result = await analyzeResponseWithLLM(llm, modelSelector, status, body);
        if (result.healthy) lastHealthReason = result.reason;
        return result;
      };

      const proc = await startApplication(repoPath, config, analyzeLogsFn, analyzeResponseFn);
      console.log(
        `[Startup] Application started successfully on attempt ${attempt}`,
      );
      stats.push({
        attempt,
        strategy,
        command: config.command,
        model: modelSelector?.current(),
        durationMs: Date.now() - attemptStart,
        result: "success",
      });
      if (stats.length > 1) printStartupStats(stats);
      modelSelector?.reset();
      if (lastHealthReason) config.healthCheckSummary = lastHealthReason;
      return {
        process: proc,
        config,
        postStartSetupHints: discovery?.postStartSetup,
      };
    } catch (err) {
      const errorMsg = toErrorMessage(err);
      const detailedError = toDetailedErrorMessage(err);
      console.error(`[Startup] Attempt ${attempt} failed: ${errorMsg}`);
      attemptErrors.push({ config, error: detailedError });

      // Classify the error for stats
      const isDockerBuildError = config.docker &&
        !!findDockerfile(repoPath) &&
        /failed to build|failed to solve|ERROR:.*process.*did not complete/i.test(detailedError);
      const isTimeoutError = /did not start on port.*within/i.test(detailedError);
      const previousErrorMsgs = attemptErrors.slice(0, -1).map((a) => a.error);
      const isCompilationError = isSourceCodeError(detailedError, previousErrorMsgs);
      const isCrash = /exited unexpectedly|exited with code/i.test(detailedError);

      const result: AttemptStat["result"] = isCompilationError
        ? "compilation"
        : isDockerBuildError
          ? "build_error"
          : isTimeoutError
            ? "timeout"
            : isCrash
              ? "crash"
              : "error";

      stats.push({
        attempt,
        strategy,
        command: config.command,
        model: modelSelector?.current(),
        durationMs: Date.now() - attemptStart,
        result,
        errorSummary: errorMsg,
      });

      // Detect source code compilation errors that Dockerfile repair can't fix
      if (isCompilationError) {
        console.error(
          "[Startup] Build failed due to source code compilation errors on consecutive attempts — this is not a Dockerfile issue. Aborting retries.",
        );
        break;
      }

      // LLM-based repair when startup fails
      // Skip on the final attempt — repairs would never be tested
      if (attempt < MAX_STARTUP_ATTEMPTS) {
        // Escalate to stronger model after repeated failures
        if (attempt > 1) modelSelector?.escalate();

        // Detect repeated root cause: did the LAST repair (of the same kind)
        // try to fix this exact error, but here we are again with the same
        // fingerprint? If so, force a strategy shift in the next prompt.
        const currentFp = errorFingerprint(detailedError);
        const lastRepair = [...repairHistory].reverse().find(
          (r) => r.kind === (isDockerBuildError ? "build" : "infra"),
        );
        const repeatedRootCause = lastRepair?.targetErrorFp === currentFp;
        if (repeatedRootCause) {
          console.log(
            "[Startup] Same error fingerprint as last repair — forcing strategy shift in next repair prompt",
          );
          // Also force model escalation when stuck on same root cause
          modelSelector?.escalate();
        }

        const previousRepairs = repairHistory
          .filter((r) => r.kind === (isDockerBuildError ? "build" : "infra"))
          .map((r) => r.summary)
          .slice(-3); // last 3 repairs of this kind

        console.log(`[Startup] Repair classification: ${isDockerBuildError ? "Dockerfile build error" : "infrastructure/runtime error"}`);

        if (isDockerBuildError) {
          const buildSummary = await repairDockerBuild(
            llm,
            repoPath,
            detailedError,
            modelSelector?.current(),
            attemptErrors.slice(0, -1).map((a) => a.error),
            startupHints,
            previousRepairs,
            repeatedRootCause,
          );
          if (buildSummary) {
            repairHistory.push({ kind: "build", summary: buildSummary, targetErrorFp: currentFp });
          }
          dockerfileRepaired = true;
        } else {
          const infraResult = await repairInfrastructure(
            llm,
            repoPath,
            config,
            detailedError,
            modelSelector?.current(),
            attemptErrors.slice(0, -1).map((a) => a.error),
            startupHints,
            previousRepairs,
            repeatedRootCause,
          );
          if (infraResult.summary) {
            repairHistory.push({ kind: "infra", summary: infraResult.summary, targetErrorFp: currentFp });
          }
          // Apply any config modifications from the repair LLM
          if (infraResult.command || infraResult.postStartCommands?.length || infraResult.addEnvVars || infraResult.healthCheckPath) {
            if (infraResult.command) {
              console.log(`[Startup] Repair LLM overrode command: ${infraResult.command}`);
              config = { ...config, command: infraResult.command };
            }
            if (infraResult.postStartCommands?.length) {
              // Replace rather than accumulate — each repair produces a fresh
              // set of commands and re-adding the same ones wastes time.
              const existing = config.postStartCommands ?? [];
              const deduped = infraResult.postStartCommands.filter(
                (cmd) => !existing.includes(cmd),
              );
              config = {
                ...config,
                postStartCommands: [...existing, ...deduped],
              };
            }
            if (infraResult.addEnvVars) {
              config = {
                ...config,
                envVars: { ...(config.envVars ?? {}), ...infraResult.addEnvVars },
              };
            }
            if (infraResult.healthCheckPath) {
              config = { ...config, healthCheckPath: infraResult.healthCheckPath };
            }
            // Update the last attempt's config so the retry uses the patched version
            attemptErrors[attemptErrors.length - 1] = { config, error: detailedError };
          }
          // Reuse config only for non-timeout, non-prereq errors (e.g. compose typo, permission fix).
          // Timeouts and prereq failures usually mean the fundamental approach is wrong —
          // UNLESS the repair added new post-start commands (e.g. DB migrations) that could fix the issue.
          const isPrereqFailure = /Command failed:.*\nprerequisite/i.test(detailedError) ||
            /prerequisite.*failed|Running prerequisite/i.test(detailedError) ||
            /command not found|not found.*command/i.test(detailedError);
          const repairModifiedConfig = !!(infraResult.command || infraResult.postStartCommands?.length || infraResult.addEnvVars || infraResult.healthCheckPath || infraResult.madeFileChanges);
          if (repairModifiedConfig || (!isTimeoutError && !isPrereqFailure && !isCrash)) {
            infraRepaired = true;
          }
        }
      }

      // Clean up any Docker containers AND volumes from failed attempts.
      // Volumes MUST be removed — stale data from a previous DB image (e.g.
      // postgres:17 → pgvector/pgvector:pg17) causes silent failures.
      if (config.docker) {
        try {
          execSync(
            "docker compose down -v 2>/dev/null; docker rm -f $(docker ps -aq) 2>/dev/null || true",
            { cwd: repoPath, stdio: "ignore", timeout: 30_000 },
          );
        } catch {
          /* ignore */
        }
      }
    }
  }

  printStartupStats(stats);

  if (startupHints.length > 0) {
    console.log(`[Startup] Accumulated hints (${startupHints.length}):`);
    for (const hint of startupHints) {
      console.log(`[Startup]   - ${hint}`);
    }
  }

  const summary = attemptErrors
    .map((a, i) => `  Attempt ${i + 1} (${a.config.command}): ${a.error}`)
    .join("\n");

  throw new Error(
    `Failed to start application after ${attemptErrors.length} attempts:\n${summary}`,
  );
}

async function identifyStartupConfig(
  llm: OpenAI,
  repoPath: string,
  stackStr: string,
  model?: string,
): Promise<StartupConfig> {
  const messages = identifyStartupPrompt(stackStr);
  const infraHandler = createInfraToolHandler(repoPath);
  const response = await chatWithTools(
    llm,
    messages,
    infraTools,
    infraHandler,
    model,
  );
  return parseStartupConfig(response);
}

async function rebuildStartupConfig(
  llm: OpenAI,
  repoPath: string,
  stackStr: string,
  previousConfig: StartupConfig,
  model?: string,
): Promise<StartupConfig> {
  const messages = rebuildStartupPrompt(
    stackStr,
    JSON.stringify(previousConfig, null, 2),
  );
  const infraHandler = createInfraToolHandler(repoPath);
  const response = await chatWithTools(
    llm,
    messages,
    infraTools,
    infraHandler,
    model,
  );
  return parseStartupConfig(response);
}

/**
 * Check if a startup config includes a step that builds from local source.
 * Used as a guardrail during rebuild to prevent running stale code.
 */
function configBuildsFromSource(config: StartupConfig): boolean {
  const all = [...(config.prerequisites ?? []), config.command].join(" ");
  // docker build, docker compose build, docker compose up --build
  if (/docker\s+(build|compose\s+build)/.test(all)) return true;
  if (/docker\s+compose/.test(all) && all.includes("--build")) return true;
  // Native build commands
  if (/\b(npm run build|yarn build|pnpm build|go build|mvn\s|gradle\s|cargo build|dotnet build|make\b|bundle exec rake)/.test(all)) return true;
  return false;
}

/**
 * Check if a command already runs inside a Docker container
 * (i.e. starts with docker run, docker exec, docker compose, etc.)
 */
function commandRunsInDocker(command: string): boolean {
  const trimmed = command.trim();
  return /^docker\s+(run|exec|compose)\b/.test(trimmed);
}

/**
 * Detect commands that stream indefinitely (logs -f, tail -f, watch, etc.)
 * and would hang forever as a post-start command.
 */
function isStreamingCommand(cmd: string): boolean {
  const trimmed = cmd.trim();
  return /\blogs\s+(-\S+\s+)*-f\b|\blogs\s+(-\S+\s+)*--follow\b|\btail\s+(-\S+\s+)*-f\b|\btail\s+(-\S+\s+)*--follow\b|\b--follow\b.*\blogs\b|\bwatch\s|\btop\b/.test(trimmed);
}

/**
 * Extract the Docker image name from a config's prerequisites.
 * Looks for `docker build -t <name>` patterns.
 */
function extractImageName(config: StartupConfig): string | undefined {
  for (const cmd of config.prerequisites ?? []) {
    const m = cmd.match(/docker\s+build\s+.*-t\s+(\S+)/);
    if (m) return m[1];
  }
  return undefined;
}

/**
 * Find a compose file in the repo root. Returns the filename or undefined.
 */
function findComposeFile(repoPath: string): string | undefined {
  const candidates = [
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
  ];
  return candidates.find((f) => existsSync(`${repoPath}/${f}`));
}

/**
 * Generate a minimal compose file from the existing Dockerfile and startup config.
 * This avoids wasting an attempt when the LLM picks docker compose but no file exists.
 */
function generateComposeFile(repoPath: string, config: StartupConfig): void {
  const port = config.port || 3000;
  const envLines = Object.entries(config.envVars ?? {})
    .map(([k, v]) => `      ${k}: "${v}"`)
    .join("\n");

  const df = findDockerfile(repoPath);
  // If non-standard Dockerfile name, use the extended build syntax
  const buildSection =
    df && df !== "Dockerfile"
      ? `    build:\n      context: .\n      dockerfile: ${df}`
      : "    build: .";

  const content = `services:
  app:
${buildSection}
    ports:
      - "${port}:${port}"
${envLines ? `    environment:\n${envLines}\n` : ""}`;

  writeFileSync(`${repoPath}/compose.yml`, content);
  console.log(`[Startup] Generated compose.yml (port ${port}, dockerfile: ${df ?? "Dockerfile"})`);
}

/**
 * Check that all \`build:\` context directories referenced in a compose file
 * actually exist on disk. Returns false if any are missing.
 */
function validateComposeBuildContexts(repoPath: string, composeFile: string): boolean {
  const filePath = `${repoPath}/${composeFile}`;
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return true; // can't read → let docker fail with a better error
  }

  const composeDir = composeFile.includes("/")
    ? composeFile.substring(0, composeFile.lastIndexOf("/"))
    : "";
  const baseDir = composeDir ? `${repoPath}/${composeDir}` : repoPath;

  // Match build context: `build: ./path` or `build:\n  context: ./path`
  const simpleBuildRe = /^\s+build:\s+(\S+)\s*$/gm;
  const contextBuildRe = /^\s+context:\s+(\S+)\s*$/gm;

  const contexts = new Set<string>();
  let m;
  while ((m = simpleBuildRe.exec(content)) !== null) {
    const val = m[1].replace(/["']/g, "");
    // Skip if it looks like a sub-key (e.g. "build:" followed by "context:")
    if (val === "" || val.startsWith("#")) continue;
    contexts.add(val);
  }
  while ((m = contextBuildRe.exec(content)) !== null) {
    contexts.add(m[1].replace(/["']/g, ""));
  }

  for (const ctx of contexts) {
    if (ctx === "." || ctx === "./") continue; // current dir always exists
    const resolved = ctx.startsWith("/") ? ctx : `${baseDir}/${ctx}`;
    if (!existsSync(resolved)) {
      console.warn(`[Startup] Compose ${composeFile}: build context "${ctx}" does not exist (${resolved})`);
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// LLM-based Dockerfile repair
// ---------------------------------------------------------------------------

/**
 * When a Docker build fails, give the LLM the error + current Dockerfile
 * and let it explore the codebase to produce a fixed Dockerfile.
 * This replaces brittle regex-based patching with a general-purpose fix.
 */
export async function repairDockerBuild(
  llm: OpenAI,
  repoPath: string,
  buildError: string,
  model?: string,
  previousErrors?: string[],
  hints?: string[],
  previousRepairs?: string[],
  repeatedRootCause?: boolean,
): Promise<string | undefined> {
  const dockerfileName = findDockerfile(repoPath);
  if (!dockerfileName) return;
  const dockerfilePath = `${repoPath}/${dockerfileName}`;
  let currentDockerfile: string;
  try {
    currentDockerfile = readFileSync(dockerfilePath, "utf-8");
  } catch {
    return;
  }

  // Write full error to a file the LLM can read, show head+tail in the prompt
  const errorLogPath = `${repoPath}/.bright-build-error.log`;
  writeFileSync(errorLogPath, buildError, "utf-8");
  const errorLines = buildError.split("\n");

  console.log(`[Startup] Repair input: error ${errorLines.length} lines (written to .bright-build-error.log), Dockerfile lines=${currentDockerfile.split("\n").length}`);

  let errorSection: string;
  if (errorLines.length <= 100) {
    errorSection = `Build output:\n\`\`\`\n${buildError}\n\`\`\``;
  } else {
    const headLines = errorLines.slice(0, 40).join("\n");
    const tailLines = errorLines.slice(-60).join("\n");
    errorSection = `First 40 lines of build output:\n\`\`\`\n${headLines}\n\`\`\`\n\nLast 60 lines:\n\`\`\`\n${tailLines}\n\`\`\`\n\n(Full log: ${errorLines.length} lines in .bright-build-error.log — use read_file if you need the middle)`;
  }

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    {
      role: "system",
      content: `You are a Docker expert. A Docker build just failed. Your job is to fix the Dockerfile.

You have tools to:
- **read_file / list_files / search_files** — inspect any file in the repository
- **run_command_on_host** — run shell commands on the host (ls, find, cat, docker inspect, docker build, etc.)
- **run_command_in_docker** — run commands inside a Docker container or image (check installed tools, read config files, test commands)
- **verify_docker_image** — check if a Docker image:tag exists on Docker Hub before using it in FROM lines
- **save_hint** — IMPORTANT: save facts you discover (e.g. "Node 22 required, not 18", "manage.py is at /usr/src/app/manage.py") so the NEXT repair attempt knows them. Use this for every non-obvious discovery.
- **remove_hint** — remove a hint from a previous attempt that turned out wrong

APPROACH:
1. Read the error carefully. Identify the exact failing command and what it's missing.
2. Use tools to investigate — read the scripts/files referenced in the error, check what files exist, understand the project structure.
3. **TEST before committing to a fix.** Use run_command_in_docker to test commands against the base image BEFORE rewriting the Dockerfile. For example:
   - \`docker run --rm <base_image> apt-cache search <package>\` to find correct package names
   - \`docker run --rm <base_image> which <tool>\` to check what's already installed
   - \`docker run --rm <base_image> cat /etc/os-release\` to check the OS/distro
   - \`docker run --rm <base_image> bash -c "apt-get update && apt-get install -y <package>"\` to verify a package installs correctly
   This avoids wasting a full rebuild cycle on a wrong guess.
4. Fix the ROOT CAUSE. Don't just suppress errors — understand WHY the command failed.
5. If the error is in a multi-stage build, check whether a later stage is missing tools/files from an earlier stage. Consider collapsing to a single stage.
6. This Dockerfile is for **production-like security testing** (DAST scanning). The app must run in production mode (RAILS_ENV=production, NODE_ENV=production, etc.) with precompiled assets and all runtime system dependencies (ImageMagick, fonts, wkhtmltopdf, ffmpeg, etc.) installed. A single stage with all tools is better than a fragile multi-stage build.
7. BUILD FROM SOURCE. All assets must be built from the local source code. Never download pre-built artifacts from external URLs.
8. Always verify base image tags exist with verify_docker_image before using them.
9. **SAVE HINTS** — whenever you discover a non-obvious fact (required Node version, correct package name, file path, config setting), call save_hint so it's available to the next repair attempt even if this one fails.

Return ONLY the complete fixed Dockerfile inside a single fenced code block. No explanation outside the code block.`,
    },
    {
      role: "user",
      content: `The Docker build failed.

${errorSection}

Current Dockerfile:
\`\`\`dockerfile
${currentDockerfile}
\`\`\`
${repeatedRootCause
    ? `\n⚠️  STRATEGY-SHIFT REQUIRED ⚠️\nThe LAST Dockerfile repair did not work — the build is failing with the SAME root cause as before. Pick a fundamentally different approach (e.g. switch base image, install the tool a different way, drop a problematic step entirely).\n`
    : ""}${previousRepairs && previousRepairs.length > 0
    ? `\nWhat previous Dockerfile repairs already tried (do NOT just slightly reword these):\n${previousRepairs.map((r, i) => `--- Repair ${i + 1} ---\n${r}`).join("\n")}\n`
    : ""}${previousErrors && previousErrors.length > 0
    ? `\nPrevious failed attempts and their errors (do NOT repeat the same mistakes):\n${previousErrors.map((e, i) => `--- Attempt ${i + 1} ---\n${e.slice(-500)}`).join("\n")}\n`
    : ""}${hints && hints.length > 0
    ? `\nHints from previous attempts:\n${hints.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n`
    : ""}
Use the tools to inspect relevant project files (and read_file on .bright-build-error.log if you need more of the build output), then return a COMPLETE fixed Dockerfile.`,
    },
  ];

  try {
    console.log("[Startup] Asking LLM to repair Dockerfile...");
    const onHint = (hint: string) => {
      if (hints && !hints.includes(hint)) hints.push(hint);
    };
    const onRemoveHint = (hint: string) => {
      if (hints) {
        const idx = hints.findIndex((h) => h.includes(hint) || hint.includes(h));
        if (idx !== -1) {
          console.log(`[Startup] Hint removed: ${hints[idx].slice(0, 100)}`);
          hints.splice(idx, 1);
        }
      }
    };
    const infraHandler = createInfraToolHandler(repoPath, onHint, onRemoveHint);
    const response = await chatWithTools(
      llm,
      messages,
      infraTools,
      infraHandler,
      model,
      20,
    );

    const fixedRaw = extractCodeBlock(response);
    if (!fixedRaw) {
      console.warn("[Startup] LLM did not return a valid Dockerfile repair");
      return;
    }

    // Sanity check: must contain FROM and at least one RUN/CMD
    if (!fixedRaw.includes("FROM ") || !/(?:RUN|CMD|ENTRYPOINT)\s/.test(fixedRaw)) {
      console.warn("[Startup] LLM returned an invalid Dockerfile — skipping");
      return;
    }

    // Post-validate: auto-fix any FROM images that don't exist on Docker Hub
    const fixedDockerfile = await fixDockerfileImages(fixedRaw);
    if (fixedDockerfile !== fixedRaw) {
      console.log("[Startup] Auto-fixed invalid Docker image tags in repaired Dockerfile");
    }

    writeFileSync(dockerfilePath, fixedDockerfile, "utf-8");
    const changed = fixedDockerfile !== currentDockerfile;
    console.log(
      `[Startup] LLM repaired Dockerfile (${fixedDockerfile.split("\n").length} lines, ${changed ? "content changed" : "WARNING: no changes detected"})`,
    );
    // Capture a short summary of what the repair did, so the next repair
    // round can see what was already attempted. Prefer prose outside the code
    // block; fall back to a generic note.
    const proseBefore = response.split(/```/)[0]?.trim();
    const summary = proseBefore && proseBefore.length > 0
      ? proseBefore.slice(0, 400)
      : `Rewrote Dockerfile (${fixedDockerfile.split("\n").length} lines${changed ? "" : ", no diff"})`;
    return summary;
  } catch (err) {
    console.warn(
      `[Startup] Dockerfile repair failed: ${err instanceof Error ? err.message : err}`,
    );
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// LLM-based infrastructure repair — fix shell scripts, compose files, env
// files, TTY flags, database setup, etc. between retry attempts.
// ---------------------------------------------------------------------------

/**
 * When a startup attempt fails for reasons OTHER than a Dockerfile build error
 * (e.g. TTY flags in scripts, missing DB, broken compose, permission issues),
 * give the LLM tools to diagnose and fix the infrastructure before the next
 * retry attempt. The LLM can read/write files and run shell commands.
 */
interface InfraRepairResult {
  /** Commands to run AFTER app starts but BEFORE health check (e.g. DB migrations inside container) */
  postStartCommands?: string[];
  /** Extra environment variables to merge into the startup config */
  addEnvVars?: Record<string, string>;
  /** Override health check path if the root route is unreliable (e.g. "/srv/status") */
  healthCheckPath?: string;
  /** Override the startup command itself (e.g. wrap bare command in 'docker run') */
  command?: string;
  /** True if the repair LLM used mutating tools (write_file, run_command, etc.) */
  madeFileChanges?: boolean;
  /** One-line summary of what the repair LLM did, to feed into the NEXT repair if this one fails */
  summary?: string;
}

/**
 * Reduce a build/runtime error string to a stable fingerprint so we can detect
 * when the SAME root cause is failing across consecutive attempts.
 *
 * The fingerprint focuses on the most distinctive lines: error/exception
 * markers, missing-file paths, and shell exit codes. Whitespace and dynamic
 * fragments (timestamps, container IDs, line numbers) are normalized so two
 * structurally identical errors produce the same fingerprint.
 */
function errorFingerprint(error: string): string {
  const interesting = error
    .split("\n")
    .map((l) => l.trim())
    .filter((l) =>
      /error|exception|fail|undefined|cannot|no such|missing|denied|refused|crashed|exit code|ENOENT|EACCES|did not complete|extension control file/i
        .test(l),
    )
    .slice(0, 8)
    .join("|")
    // Normalize variable bits
    .replace(/\b[0-9a-f]{12,}\b/gi, "<id>")
    .replace(/:\d+:\d+/g, ":<n>:<n>")
    .replace(/:\d+\b/g, ":<n>")
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.+Z-]+/g, "<ts>")
    .replace(/\s+/g, " ")
    .toLowerCase();
  return interesting || error.slice(0, 200).toLowerCase();
}

async function repairInfrastructure(
  llm: OpenAI,
  repoPath: string,
  config: StartupConfig,
  errorOutput: string,
  model?: string,
  previousErrors?: string[],
  hints?: string[],
  previousRepairs?: string[],
  repeatedRootCause?: boolean,
): Promise<InfraRepairResult> {
  // Write full error to a file the LLM can read, show head+tail in the prompt
  const errorLogPath = `${repoPath}/.bright-build-error.log`;
  writeFileSync(errorLogPath, errorOutput, "utf-8");
  const errorLines = errorOutput.split("\n");

  let errorSection: string;
  if (errorLines.length <= 100) {
    errorSection = `Error output:\n\`\`\`\n${errorOutput}\n\`\`\``;
  } else {
    const headLines = errorLines.slice(0, 40).join("\n");
    const tailLines = errorLines.slice(-60).join("\n");
    errorSection = `First 40 lines (root cause is often here):\n\`\`\`\n${headLines}\n\`\`\`\n\nLast 60 lines:\n\`\`\`\n${tailLines}\n\`\`\`\n\n(Full log: ${errorLines.length} lines in .bright-build-error.log — use read_file if you need the middle)`;
  }

  // Gather a diagnostic snapshot so the LLM starts with full situational
  // awareness instead of spending turns running docker ps / logs / inspect.
  const diagnosticSnapshot = config.docker ? gatherDiagnosticSnapshot(repoPath) : "";

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    {
      role: "system",
      content: `You are a DevOps engineer fixing a failed application startup. You have tools to:
- **read_file / list_files / search_files** — inspect the repository
- **write_file** — modify shell scripts, compose files, config files, etc.
- **run_command_on_host** — run diagnostic or repair commands on the host (docker logs, docker ps, sed, chmod, find, etc.)
- **run_command_in_docker** — run commands inside the application container (check installed tools, read config, test commands, inspect processes)
- **probe_url** — make an HTTP request and see the full response (status, headers, body). Use this to check what the app returns, diagnose 500 errors, test if endpoints work.
- **search_web** — search the internet for technical solutions. Use when you're stuck on: how to install a specific package on a specific OS, the correct package name for a version, how to fix an unfamiliar error. Don't guess — search.
- **fetch_url** — fetch the full content of a web page (e.g. a Stack Overflow answer or docs page found via search_web). Large pages are saved to .bright-fetched-page.txt — use read_file to see the full content.
- **verify_docker_image** — check if a Docker image exists
- **wait** — wait for a specified number of seconds (use when services need time to start up)
- **save_hint** — save an important discovery for the NEXT repair attempt (e.g. "app reads DB config from config/database.yml not DATABASE_URL", "needs Redis on port 6379"). Use this whenever you learn something non-obvious about how this app works.
- **remove_hint** — remove a previously saved hint that turned out to be WRONG or MISLEADING. If you see hints that led to this failure, remove them.

IMPORTANT: The startup command runs ON THE HOST, not inside a container. If the command uses a tool like pnpm/node/rails that only exists inside the Docker image, the command must be wrapped with 'docker run' or 'docker exec'.

APPROACH:
1. **STUDY THE DIAGNOSTIC SNAPSHOT FIRST.** A "DIAGNOSTIC SNAPSHOT" section is appended to the error details below. It contains the CURRENT docker state: container statuses, volumes, health check results, key error lines from logs, and the resolved compose config. Read it CAREFULLY before doing anything — the root cause is usually visible in this snapshot.
2. If the snapshot isn't enough, read the full logs: .bright-container-logs.txt and .bright-build-error.log.
3. If the error mentions HTTP 500 or similar, use **probe_url** to see the full error response from the app — it often contains the exact problem (e.g. "Migrations are pending", "database does not exist").
4. If hints from previous attempts are provided, evaluate them critically — remove any that are wrong or led to this failure.
5. Fix the ROOT CAUSE with targeted changes — fix config files, scripts, compose files, environment so the startup command can succeed.
6. After fixing, verify your changes (e.g. re-read the patched file, run a diagnostic command, use probe_url to test the app).
7. Before finishing, call save_hint for any important discoveries about this app's configuration or behavior.

IMPORTANT DATABASE TIPS:
- **Stale volumes are a top cause of DB auth failures.** If DB logs show "Password did not match" or "Login failed", the DB volume was initialized with a different password on a prior run. MSSQL/PostgreSQL/MySQL all set the admin password ONLY on first initialization. Fix: \`docker compose down && docker volume rm <specific_volume_name> && docker compose up -d\`. Use \`docker volume ls\` to identify the stale volume. Do NOT use \`docker compose down -v\` — it destroys ALL volumes including healthy data.
- If a migration fails because of a missing PostgreSQL extension (e.g. pgvector), first check if you can REMOVE the plugin that requires it (e.g. delete/rename its directory under plugins/) rather than installing the extension. Removing an optional plugin is often simpler than fixing extension availability.
- If the app crashes with "No such file or directory" for a tool (e.g. brotli, wkhtmltopdf), install it in the Dockerfile or set an env var to disable the feature that needs it.

COMMON DOCKER NETWORKING PITFALL:
If the app starts inside the container but the port is NOT reachable from the host (timeout / connection refused from outside), the server is almost certainly binding to 127.0.0.1 inside the container instead of 0.0.0.0. Fix by setting the appropriate env var:
- Rails/Puma: RUBY_BIND=0.0.0.0 or pass -b 0.0.0.0
- Rails/Unicorn/Pitchfork: UNICORN_BIND_ALL=true
- Node.js/Express: HOST=0.0.0.0 or --host 0.0.0.0
- Django: pass 0.0.0.0:PORT to runserver
- Generic: BIND=0.0.0.0 or HOST=0.0.0.0
Use run_command_in_docker to check what the server is actually listening on (ss -ltnp or netstat -ltnp).

WHEN YOU'RE STUCK — USE search_web:
If you can't figure out how to install a package, fix a version mismatch, or resolve an unfamiliar error after one attempt, use **search_web** to look it up. For example:
- "install imagemagick 7 debian bookworm" (when apt only has v6)
- "fix ENOENT magick binary rails" (when a specific binary is missing)
- "postgresql 16 pgvector extension docker" (when an extension isn't available)
Don't waste turns guessing package names — search for the answer.

RESPONSE FORMAT:
After fixing the issue, reply with a JSON object describing what changed:
\`\`\`json
{
  "summary": "Brief description of what you fixed",
  "command": "docker run --name myapp -p 3000:3000 -d myapp-image bundle exec rails server",
  "postStartCommands": ["docker compose exec app rails db:create db:migrate"],
  "addEnvVars": {"DATABASE_URL": "postgres://..."},
  "healthCheckPath": "/srv/status"
}
\`\`\`
- **command**: override the startup command if the current one is fundamentally wrong (e.g. bare "bundle exec" on the host when it should be "docker run ... bundle exec"). Only set this if the command itself needs to change.
- **postStartCommands**: commands that must run AFTER the app containers start but BEFORE the health check (e.g. DB migrations, cache warmup, seeding). These run on the HOST. If the command must run inside a container, wrap it with 'docker compose exec <service>' or 'docker exec <container>'. NEVER use streaming/follow commands here (e.g. 'logs -f', 'tail -f', 'watch') — they hang forever and block startup.
- **addEnvVars**: environment variables to add/override for the next startup attempt.
- **healthCheckPath**: if the app's root route ("/") returns errors but a different endpoint is healthy (e.g. "/health", "/srv/status"), specify it here so the health check uses that path instead.
- Omit fields that don't apply — just include "summary" if you only edited files.`,
    },
    {
      role: "user",
      content: `The application failed to start with this config:

Command: ${config.command}
Prerequisites: ${JSON.stringify(config.prerequisites)}
Docker: ${config.docker}

${errorSection}
${repeatedRootCause
    ? `\n⚠️  STRATEGY-SHIFT REQUIRED ⚠️\nThe LAST repair attempt did not work — the application is failing with the SAME root cause as before. Do NOT iterate on the previous fix. Pick a fundamentally different approach (e.g. change the base image, swap out the conflicting dependency, disable the failing component at the source level instead of via volume tricks, etc.).\n`
    : ""}${previousRepairs && previousRepairs.length > 0
    ? `\nWhat previous repair attempts already tried (do NOT just slightly reword these — try genuinely different approaches if these failed):\n${previousRepairs.map((r, i) => `--- Repair ${i + 1} ---\n${r}`).join("\n")}\n`
    : ""}${previousErrors && previousErrors.length > 0
    ? `\nPrevious failed attempts and their errors (do NOT repeat the same fixes):\n${previousErrors.map((e, i) => `--- Attempt ${i + 1} ---\n${e.slice(-500)}`).join("\n")}\n`
    : ""}${hints && hints.length > 0
    ? `\nHints from previous repair attempts (use these — they were discovered through investigation):\n${hints.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n`
    : ""}${diagnosticSnapshot}

Study the diagnostic snapshot above, identify the root cause, fix it, then reply with the JSON object.`,
    },
  ];

  try {
    console.log("[Startup] Asking LLM to repair infrastructure...");
    const onHint = (hint: string) => {
      if (hints && !hints.includes(hint)) hints.push(hint);
    };
    const onRemoveHint = (hint: string) => {
      if (hints) {
        const idx = hints.findIndex((h) => h.includes(hint) || hint.includes(h));
        if (idx !== -1) {
          console.log(`[Startup] Hint removed: ${hints[idx].slice(0, 100)}`);
          hints.splice(idx, 1);
        }
      }
    };
    const infraHandler = createInfraToolHandler(repoPath, onHint, onRemoveHint);
    let usedMutatingTools = false;
    const trackingHandler: ToolHandler = async (name, args) => {
      const result = await infraHandler(name, args);
      if (name === "write_file" || name === "edit_file" || name === "run_command_on_host" || name === "run_command_in_docker") {
        usedMutatingTools = true;
      }
      return result;
    };
    const response = await chatWithTools(
      llm,
      messages,
      infraTools,
      trackingHandler,
      model,
      30,
    );
    console.log(`[Startup] Infrastructure repair: ${response.slice(0, 200)}`);

    // Parse config modifications from the LLM response
    const result = parseInfraRepairResult(response);
    if (usedMutatingTools) {
      result.madeFileChanges = true;
      console.log(`[Startup] Infra repair used mutating tools (write_file/run_command)`);
    }
    return result;
  } catch (err) {
    console.warn(
      `[Startup] Infrastructure repair failed: ${err instanceof Error ? err.message : err}`,
    );
    return {};
  }
}

function parseInfraRepairResult(response: string): InfraRepairResult {
  try {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) ??
      response.match(/(\{[\s\S]*\})/);
    if (!jsonMatch?.[1]) return {};
    const parsed = JSON.parse(jsonMatch[1]);
    const result: InfraRepairResult = {};
    if (Array.isArray(parsed.postStartCommands) && parsed.postStartCommands.length > 0) {
      result.postStartCommands = parsed.postStartCommands.filter(
        (cmd: unknown) => typeof cmd === "string" && cmd.length > 0 && !isStreamingCommand(cmd as string),
      );
      if (result.postStartCommands!.length > 0) {
        console.log(`[Startup] Infra repair added post-start commands: ${result.postStartCommands!.join(", ")}`);
      }
    }
    if (parsed.addEnvVars && typeof parsed.addEnvVars === "object") {
      result.addEnvVars = parsed.addEnvVars;
      console.log(`[Startup] Infra repair added env vars: ${Object.keys(result.addEnvVars!).join(", ")}`);
    }
    if (typeof parsed.healthCheckPath === "string" && parsed.healthCheckPath) {
      result.healthCheckPath = parsed.healthCheckPath;
      console.log(`[Startup] Infra repair set health check path: ${result.healthCheckPath}`);
    }
    if (typeof parsed.command === "string" && parsed.command) {
      result.command = parsed.command;
      console.log(`[Startup] Infra repair overrode command: ${result.command}`);
    }
    if (typeof parsed.summary === "string" && parsed.summary) {
      result.summary = parsed.summary.slice(0, 400);
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Scan a compose file for env_file references and return the names
 * of any files that do not exist on disk.
 */
/**
 * Generate a Dockerfile using the LLM when the project needs Docker-based
 * startup but no Dockerfile exists.  The LLM inspects the project's config
 * and source files via codebase tools to produce an appropriate Dockerfile.
 */
export async function generateDockerfile(
  llm: OpenAI,
  repoPath: string,
  stackStr: string,
  model?: string,
  discovery?: ProjectDiscovery,
): Promise<void> {
  const dockerHandler = createDockerfileToolHandler(repoPath);
  const messages = generateDockerfilePrompt(stackStr, discovery);
  const response = await chatWithTools(
    llm,
    messages,
    dockerfileTools,
    dockerHandler,
    model,
  );

  const contentRaw = extractCodeBlock(response);
  if (!contentRaw) {
    throw new Error(
      "Failed to generate a valid Dockerfile — LLM did not return a code block",
    );
  }

  // Post-validate: auto-fix any FROM images that don't exist on Docker Hub
  const content = await fixDockerfileImages(contentRaw);
  if (content !== contentRaw) {
    console.log("[Startup] Auto-fixed invalid Docker image tags in generated Dockerfile");
  }

  writeFileSync(`${repoPath}/${BRIGHT_DOCKERFILE}`, content);
  console.log(
    `[Startup] Generated ${BRIGHT_DOCKERFILE} (${content.split("\n").length} lines)`,
  );
}

async function retryStartupConfig(
  llm: OpenAI,
  repoPath: string,
  stackStr: string,
  previousConfig: StartupConfig,
  errorOutput: string,
  attempt: number,
  model?: string,
  allPreviousAttempts?: Array<{ config: string; error: string }>,
  hints?: string[],
): Promise<StartupConfig> {
  const messages = retryStartupPrompt(
    stackStr,
    JSON.stringify(previousConfig, null, 2),
    errorOutput,
    attempt,
    allPreviousAttempts,
    hints,
  );
  const onHint = (hint: string) => {
    if (hints && !hints.includes(hint)) hints.push(hint);
  };
  const onRemoveHint = (hint: string) => {
    if (hints) {
      const idx = hints.findIndex((h) => h.includes(hint) || hint.includes(h));
      if (idx !== -1) {
        console.log(`[Startup] Hint removed: ${hints[idx].slice(0, 100)}`);
        hints.splice(idx, 1);
      }
    }
  };
  const infraHandler = createInfraToolHandler(repoPath, onHint, onRemoveHint);
  const response = await chatWithTools(
    llm,
    messages,
    infraTools,
    infraHandler,
    model,
  );
  return parseStartupConfig(response);
}

function parseStartupConfig(response: string): StartupConfig {
  try {
    const jsonStr = extractJson(response);
    const parsed = JSON.parse(jsonStr);
    // Filter out natural language "prerequisites" that aren't real commands
    const prerequisites = (parsed.prerequisites ?? []).filter(
      (cmd: unknown) =>
        typeof cmd === "string" && cmd.length > 0 && looksLikeCommand(cmd),
    );

    const envVars: Record<string, string> = parsed.envVars ?? {};
    let command: string = parsed.command ?? "npm start";

    // Extract inline env vars from the command (e.g. "DB_PASSWORD=x docker compose up")
    // and move them into envVars so they're available to prerequisites too.
    const extracted = extractInlineEnvVars(command);
    command = extracted.command;
    Object.assign(envVars, extracted.envVars);

    return {
      command,
      port: parsed.port ?? 3000,
      prerequisites,
      envVars,
      docker: parsed.docker ?? false,
      ...(typeof parsed.healthCheckPath === "string" && parsed.healthCheckPath
        ? { healthCheckPath: parsed.healthCheckPath }
        : {}),
    };
  } catch {
    return {
      command: "npm start",
      port: 3000,
      prerequisites: ["npm install"],
      envVars: { NODE_ENV: "production" },
      docker: false,
    };
  }
}

/**
 * Extract leading KEY=VALUE pairs from a shell command.
 * e.g. "DB_PASSWORD=x RAILS_ENV=test docker compose up" →
 *   { command: "docker compose up", envVars: { DB_PASSWORD: "x", RAILS_ENV: "test" } }
 */
function extractInlineEnvVars(command: string): {
  command: string;
  envVars: Record<string, string>;
} {
  const envVars: Record<string, string> = {};
  let rest = command;

  // Match KEY=VALUE tokens at the start of the command
  while (true) {
    const match = rest.match(/^(\w+)=((?:"[^"]*"|'[^']*'|\S)+)\s+(.*)/s);
    if (!match) break;
    const key = match[1];
    // Skip if the "key" looks like a command (e.g. "docker" in "docker=...")
    if (/^[a-z]/.test(key) && !/[A-Z_]/.test(key)) break;
    envVars[key] = match[2].replace(/^["']|["']$/g, "");
    rest = match[3];
  }

  return { command: rest || command, envVars };
}

/**
 * If the repo is a shallow clone AND uses git-based versioning tools,
 * fetch the full history so Docker builds can compute version numbers.
 * Only needed for projects using Nerdbank.GitVersioning, GitVersion, etc.
 */
function unshallowIfNeeded(repoPath: string): void {
  const shallowFile = `${repoPath}/.git/shallow`;
  if (!existsSync(shallowFile)) return;

  // Only unshallow if the project uses git-based versioning
  const versioningIndicators = [
    "Directory.Build.props",
    "version.json",         // Nerdbank.GitVersioning
    "GitVersion.yml",       // GitVersion
    "GitVersion.yaml",
  ];
  const needsHistory = versioningIndicators.some(f =>
    existsSync(`${repoPath}/${f}`),
  );
  if (!needsHistory) {
    // Also check .csproj files for Nerdbank reference
    try {
      const out = execSync(
        "grep -rl 'Nerdbank.GitVersioning\\|GitVersion' --include='*.csproj' --include='*.props' . 2>/dev/null | head -1",
        { cwd: repoPath, encoding: "utf-8", timeout: 5_000 },
      ).trim();
      if (!out) return;
    } catch {
      return;
    }
  }

  console.log(
    "[Startup] Detected shallow clone with git-based versioning — fetching full history",
  );
  try {
    execSync(
      "git fetch --unshallow 2>/dev/null || git fetch --depth=2147483647 2>/dev/null || true",
      {
        cwd: repoPath,
        stdio: "pipe",
        timeout: 120_000,
      },
    );
  } catch {
    console.warn(
      "[Startup] Failed to unshallow git repo — build may fail if version tools require full history",
    );
  }
}

/**
 * Ensure a .dockerignore exists and excludes common directories that cause
 * permission errors during docker build (e.g. data/postgres with 0700 perms).
 */
export function ensureDockerIgnore(repoPath: string): void {
  const ignorePath = `${repoPath}/.dockerignore`;
  const problematicDirs = ["data/", ".data/", "tmp/", "log/"];
  
  let existing = "";
  try {
    existing = readFileSync(ignorePath, "utf-8");
  } catch { /* doesn't exist yet */ }

  const linesToAdd = problematicDirs.filter(
    (dir) =>
      !existing.includes(dir) &&
      existsSync(`${repoPath}/${dir.replace(/\/$/, "")}`),
  );

  if (linesToAdd.length === 0) return;

  const newContent = existing
    ? `${existing.trimEnd()}\n# Added by bright-agent to avoid permission errors\n${linesToAdd.join("\n")}\n`
    : `# Added by bright-agent to avoid permission errors\n${linesToAdd.join("\n")}\n`;

  writeFileSync(ignorePath, newContent);
  console.log(
    `[Startup] Updated .dockerignore to exclude: ${linesToAdd.join(", ")}`,
  );
}

/**
 * Heuristic: a real shell command starts with a known CLI tool or path,
 * not an English sentence.
 */
function looksLikeCommand(s: string): boolean {
  const trimmed = s.trim();
  // Common command prefixes
  if (
    /^(npm|npx|yarn|pnpm|docker|make|pip|python|go|gradle|mvn|java|cargo|gem|bundle|cp|mv|mkdir|cat|echo|sh|bash|chmod|curl|wget|git|apt|brew|sed|awk|tee|touch|ln|export|cd|source|\.|\/)/.test(
      trimmed,
    )
  ) {
    return true;
  }
  // Reject if it starts with a capitalized English word followed by a space
  // (e.g. "Ensure Docker...", "Create a .env...", "Use the local...")
  if (/^[A-Z][a-z]+\s/.test(trimmed)) {
    return false;
  }
  // Allow anything else (could be a custom binary)
  return true;
}

// ---------------------------------------------------------------------------
// Pre-validate: check native tool availability
// ---------------------------------------------------------------------------

/**
 * If the LLM chose a native (non-Docker) startup but the required build tools
 * aren't installed on the host, switch to a Docker-based approach.
 * This is a fast check (~0.1s) that saves wasting a full attempt on a guaranteed failure.
 */
function ensureToolsAvailable(
  repoPath: string,
  config: StartupConfig,
): StartupConfig {
  const knownTools = [
    { re: /\bdotnet\b/, name: "dotnet" },
    { re: /\bsbt\b/, name: "sbt" },
    { re: /\bgo\s+(build|run|mod)\b/, name: "go" },
    { re: /\bmvn\b/, name: "mvn" },
    { re: /\bgradle\b/, name: "gradle" },
    { re: /\bcargo\b/, name: "cargo" },
    { re: /\bpip\s+install\b/, name: "pip" },
    { re: /\bbundle\s+(install|exec)\b/, name: "bundle" },
    { re: /\bmix\s/, name: "mix" },
  ];

  const fullCommand = [...config.prerequisites, config.command].join(" ");

  for (const { re, name } of knownTools) {
    if (re.test(fullCommand) && !isToolAvailable(name)) {
      console.log(
        `[Startup] "${name}" not found on host — switching to Docker build`,
      );
      const imageName = "bright-app-local";
      const df = findDockerfile(repoPath);
      const fFlag = df && df !== "Dockerfile" ? `-f ${df} ` : "";
      return {
        command: `docker run --name ${imageName} -p ${config.port}:${config.port} -d ${imageName}`,
        port: config.port,
        prerequisites: [`docker build ${fFlag}-t ${imageName} .`.trim()],
        envVars: config.envVars,
        docker: true,
      };
    }
  }

  return config;
}

/**
 * Strip -t / -it / --tty flags from docker exec / docker run commands.
 * We run non-interactively so TTY-enabled containers fail with
 * "cannot attach stdin to a TTY-enabled container".
 *
/**
 * Inject `-e KEY=VALUE` flags into `docker compose run/exec` commands so
 * env vars from config.envVars actually reach the container.  Host env vars
 * don't automatically pass through to compose containers.
 */
function injectComposeEnvFlags(cmd: string, envVars: Record<string, string>): string {
  if (!envVars || Object.keys(envVars).length === 0) return cmd;

  // Build -e flags for all env vars (single-quote values to prevent shell expansion)
  const eFlags = Object.entries(envVars)
    .map(([k, v]) => `-e ${k}='${v.replace(/'/g, "'\\''")}'`)
    .join(" ");

  // Inject after `docker compose run [--rm]` or `docker compose exec [-T]`
  return cmd.replace(
    /docker\s+compose\s+(run\s+(?:--rm\s+)?|exec\s+(?:-T\s+)?)/g,
    (match) => `${match}${eFlags} `,
  );
}

/**
 * Strip TTY flags from docker run/exec commands to prevent
 * "cannot attach stdin" errors in non-interactive environments.
 *
 * Handles flags anywhere in the command, not just immediately after docker run:
 *   docker run --rm -it -p 3000:3000 → docker run --rm -i -p 3000:3000
 *   docker exec -e FOO=bar -it container → docker exec -e FOO=bar -i container
 */
function stripDockerTtyFlags(cmd: string): string {
  // Split on command separators (&&, ||, ;) to handle each segment independently.
  // Only strip TTY flags inside "docker run" and "docker exec" segments —
  // NOT "docker build -t" (tag flag) or other subcommands.
  return cmd.replace(
    /\bdocker\s+(run|exec)\b[^;&|]*/g,
    (segment) =>
      segment
        // Replace standalone -it → -i
        .replace(/\s-it\b/g, " -i")
        // Replace standalone -t flag (space before AND after)
        .replace(/\s-t\s/g, " ")
        // Remove --tty
        .replace(/\s--tty\b/g, "")
        // Handle combined flags containing t (e.g. -dit → -di, -itu → -iu)
        .replace(/\s-([a-zA-Z]*t[a-zA-Z]*)\b/g, (_m, flags: string) => {
          if (flags.length > 5) return _m;
          const without = flags.replace(/t/g, "");
          return without ? ` -${without}` : "";
        }),
  );
}

/**
 * Patch shell scripts referenced by the startup command/prerequisites to
 * remove docker TTY flags (-it, -t, --tty).  Projects like Discourse ship
 * wrapper scripts (bin/docker/boot_dev) that call `docker exec -it` which
 * fails in CI / non-interactive environments.
 *
 * Instead of trying to follow `source` directives (which often use
 * $() command substitution we can't resolve), we scan ALL files in the
 * same directory trees as the referenced scripts.
 */
function patchScriptTtyFlags(
  repoPath: string,
  config: StartupConfig,
): void {
  // Collect directories containing scripts referenced in command + prerequisites
  const allCmds = [config.command, ...config.prerequisites];
  const scriptDirs = new Set<string>();

  for (const cmd of allCmds) {
    // Match script invocations like `bin/docker/boot_dev`, `d/rails`, `./scripts/start.sh`
    // Patterns: *.sh files, paths with bin/, and short relative paths (e.g. d/boot_dev)
    const matches = cmd.matchAll(/(?:\.\/)?(\S+\.sh|\S*bin\/\S+|[a-zA-Z][\w]*\/[\w./-]+)/g);
    for (const m of matches) {
      const candidate = m[1];
      // Skip common binaries that aren't repo scripts
      if (/^\/(usr|bin|sbin)\//.test(candidate)) continue;
      // Skip Docker image references (contain : for tag)
      if (candidate.includes(":")) continue;
      const fullPath = `${repoPath}/${candidate}`;
      if (existsSync(fullPath)) {
        // Add the directory containing this script
        const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
        scriptDirs.add(dir);
      }
    }
  }

  if (scriptDirs.size === 0) return;

  // Scan all files in those directories for docker TTY flags
  // Docker commands in scripts often span multiple lines with backslash:
  //   docker exec \
  //     -it \
  //     -u user ...
  // So we match -it / -t as standalone flags on ANY line, not just same line as docker exec.

  for (const dir of scriptDirs) {
    let files: string[];
    try {
      files = execSync(`find "${dir}" -maxdepth 2 -type f 2>/dev/null`, {
        encoding: "utf-8",
        timeout: 5_000,
      }).trim().split("\n").filter(Boolean);
    } catch {
      continue;
    }

    for (const filePath of files) {
      try {
        const content = readFileSync(filePath, "utf-8");
        // Only patch files that actually contain docker exec/run
        if (!/docker\s+(?:exec|run)/.test(content)) continue;

        const patched = content
          // Replace -it flag (standalone or combined) on same or continuation lines
          // Handles: "-it", "-it \", "  -it  \"
          .replace(/^(\s*)-it(\s*\\?\s*)$/gm, "$1-i$2")
          // Handles: "docker exec -it" on the same line
          .replace(/\b(docker\s+(?:exec|run)\s+(?:[^\n]*?\s)?)-it\b/g, "$1-i")
          // Handles: standalone -t (without i) on continuation lines
          .replace(/^(\s*)-t(\s*\\?\s*)$/gm, (_m, pre: string, post: string) => {
            // If the line is JUST "-t" as a flag, remove it entirely
            return post.includes("\\") ? `${pre}${post}` : "";
          })
          // Remove --tty anywhere
          .replace(/\s--tty\b/g, "");

        if (patched !== content) {
          writeFileSync(filePath, patched);
          console.log(`[Startup] Patched TTY flags in ${filePath.replace(repoPath + "/", "")}`);
        }
      } catch { /* ignore binary/unreadable/unwritable files */ }
    }
  }
}

/** Check whether a CLI tool is available on the host */
function isToolAvailable(name: string): boolean {
  try {
    execSync(`command -v ${name}`, { stdio: "pipe", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

/** Callback for AI-powered log analysis during health check waits */
/** Context passed alongside container logs so the AI can correlate log
 * activity with actual host-side reachability of the app's port. */
export interface LogAnalyzerContext {
  hostPortReachable: boolean; // true once the host has gotten ANY HTTP response (even 5xx)
  consecutiveConnFailures: number; // host-side connection refused/reset count
  secondsWaiting: number; // seconds since waitForPort started polling
  port: number;
}

type LogAnalyzer = (logs: string, ctx?: LogAnalyzerContext) => Promise<{ status: "progress" | "fatal" | "unknown"; summary: string }>;

/** Callback for AI-powered HTTP response health analysis */
type ResponseAnalyzer = (status: number, body: string) => Promise<{ healthy: boolean; reason: string }>;

async function startApplication(
  repoPath: string,
  config: StartupConfig,
  analyzeLogsFn?: LogAnalyzer,
  analyzeResponseFn?: ResponseAnalyzer,
): Promise<ChildProcess> {
  // Validate build contexts — fail fast if a compose file references
  // a non-existent directory (saves a full Docker build attempt)
  if (config.docker && /docker\s+compose/.test(config.command)) {
    const composeFileMatch = config.command.match(/-f\s+(\S+)/);
    const cdMatch = config.command.match(/cd\s+(\S+)\s*&&/);
    const composeFile = composeFileMatch?.[1]
      ?? (cdMatch ? `${cdMatch[1]}/docker-compose.yml` : null);
    if (composeFile && existsSync(`${repoPath}/${composeFile}`)) {
      if (!validateComposeBuildContexts(repoPath, composeFile)) {
        throw new Error(
          `Compose file ${composeFile} references a build context that does not exist. ` +
          `This is likely a template scaffold — try building from the root Dockerfile instead.`,
        );
      }
    }
  }

  // Unshallow the git repo if needed — tools like Nerdbank.GitVersioning
  // fail inside Docker when .git is from a shallow clone.
  if (config.docker) {
    unshallowIfNeeded(repoPath);
    ensureDockerIgnore(repoPath);
  }

  // Patch shell scripts that use docker exec -it / docker run -it —
  // we run non-interactively so TTY flags cause "cannot attach stdin" errors.
  patchScriptTtyFlags(repoPath, config);

  // Run prerequisites
  for (let cmd of config.prerequisites) {
    // Strip TTY flags — we run non-interactively (no terminal attached)
    cmd = stripDockerTtyFlags(cmd);
    // Force plain progress output for Docker builds — BuildKit buffers output
    // by default, causing our stall-detection to falsely time out active builds.
    if (/docker\s+(compose\s+)?build/.test(cmd) && !cmd.includes("--progress")) {
      cmd = cmd.replace(/(docker\s+(?:compose\s+)?build)/, "$1 --progress=plain");
    }
    console.log(`[Startup] Running prerequisite: ${cmd}`);
    await runPrerequisite(cmd, repoPath, config.envVars);
  }

  // Build environment
  const env = { ...process.env, ...config.envVars };

  // For docker compose commands, add --wait to wait for healthchecks
  let command = stripDockerTtyFlags(config.command);
  if (
    config.docker &&
    /docker\s+compose/.test(command) &&
    command.includes("-d") &&
    !command.includes("--wait")
  ) {
    command = command.replace("-d", "-d --wait");
  }

  console.log(
    `[Startup] Starting application: ${command} (port ${config.port})`,
  );

  // Use shell: true so commands with inline env vars (DB_PASSWORD=x cmd),
  // && chains, pipes, and other shell features work correctly.
  const child = spawn(command, [], {
    cwd: repoPath,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    shell: true,
  });

  // Capture output for error reporting
  const outputLines: string[] = [];
  const detectedContainerIds: string[] = [];

  if (child.stdout) {
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      outputLines.push(line);
      // `docker run -d` prints 64-char hex container IDs on stdout
      if (/^[0-9a-f]{64}$/.test(line.trim())) {
        detectedContainerIds.push(line.trim());
      }
      console.log(`[App] ${line}`);
    });
  }
  if (child.stderr) {
    const rl = createInterface({ input: child.stderr });
    rl.on("line", (line) => {
      outputLines.push(`ERR: ${line}`);
      console.error(`[App:err] ${line}`);
    });
  }

  // Check if process dies immediately
  const earlyExitPromise = new Promise<never>((_, reject) => {
    child.on("exit", (code) => {
      if (code !== null && code !== 0) {
        const head = outputLines.slice(0, 30).join("\n");
        const tail = outputLines.slice(-30).join("\n");
        const containerLogs = config.docker ? captureDockerLogs(repoPath, 50) : "";
        const parts = [`Process exited with code ${code}.`];
        if (outputLines.length > 60) {
          parts.push(`First 30 lines:\n${head}`, `Last 30 lines:\n${tail}`);
        } else {
          parts.push(`Output:\n${outputLines.join("\n")}`);
        }
        if (containerLogs && containerLogs !== "No container logs available.") {
          parts.push(`Container logs:\n${containerLogs}`);
        }
        reject(new Error(parts.join("\n\n")));
      }
    });
    child.on("error", (err) => {
      reject(new Error(`Failed to spawn process: ${err.message}`));
    });
  });

  if (config.docker && command.includes("--wait")) {
    // With --wait, docker compose blocks until services are healthy then exits
    // Wait for compose to finish (up to 5 min), then briefly check the port
    const composeExitPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("docker compose --wait timed out after 300s"));
      }, 300_000);
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else {
          const head = outputLines.slice(0, 30).join("\n");
          const tail = outputLines.slice(-30).join("\n");
          const containerLogs = captureDockerLogs(repoPath, 50);
          const parts = [`docker compose exited with code ${code}.`];
          if (outputLines.length > 60) {
            parts.push(`First 30 lines:\n${head}`, `Last 30 lines:\n${tail}`);
          } else {
            parts.push(`Output:\n${outputLines.join("\n")}`);
          }
          if (containerLogs && containerLogs !== "No container logs available.") {
            parts.push(`Container logs:\n${containerLogs}`);
          }
          reject(new Error(parts.join("\n\n")));
        }
      });
    });

    try {
      await Promise.race([composeExitPromise, earlyExitPromise]);
    } catch (err) {
      // --wait fails if ANY container is unhealthy (e.g. watchtower, sidecars).
      // The app container itself may be fine — fall back to port check.
      const errMsg = toErrorMessage(err);
      if (
        errMsg.includes("unhealthy") ||
        errMsg.includes("exited with code") ||
        errMsg.includes("invalid compose project")
      ) {
        console.warn(
          `[Startup] docker compose --wait failed (${errMsg.slice(0, 200)}), falling back to port check...`,
        );
        logDockerFailure(repoPath);

        // Run post-start commands before the fallback port check.
        // This solves the chicken-and-egg problem: the app may have crashed
        // because it needs migrations/asset-precompilation that only post-start
        // commands can provide (DB must be running first).
        if (config.postStartCommands?.length) {
          console.log("[Startup] Running post-start commands before fallback port check...");
          await runPostStartCommands(config, repoPath);
          // Restart the app container so it can boot with the post-start
          // changes applied (e.g. migrated DB, precompiled assets).
          try {
            execSync(
              "docker compose up -d --no-deps app 2>/dev/null || docker compose up -d --no-deps web 2>/dev/null || true",
              { cwd: repoPath, stdio: "pipe", timeout: 30_000 },
            );
            await sleep(3_000);
          } catch { /* best effort */ }
        }

        try {
          await waitForPort(config.port, 120_000, config.healthCheckPath, repoPath, analyzeLogsFn, analyzeResponseFn);
          console.log(
            `[Startup] Port ${config.port} is reachable despite --wait failure`,
          );
          return child;
        } catch {
          throw new Error(
            `docker compose --wait failed and port ${config.port} is not reachable. Original error: ${errMsg.slice(0, 300)}`,
          );
        }
      }
      logDockerFailure(repoPath);
      throw err;
    }

    // Compose exited successfully — services should be healthy.
    // However the container healthcheck may only verify the process is alive,
    // not that the app is serving HTTP.  Dev setups often run npm install or
    // wait-for-it inside the container, so allow generous time for the port.
    console.log("[Startup] Docker Compose services healthy, checking port...");

    // Run post-start commands (e.g. DB migrations) before the health check
    await runPostStartCommands(config, repoPath);

    // If the app container crashed (e.g. initializers hit unmigrated DB) but
    // post-start commands ran successfully via `run --rm`, restart the app so
    // it can boot against the now-migrated database.
    if (config.postStartCommands?.length) {
      try {
        const appState = execSync(
          "docker compose ps --format '{{.Service}} {{.State}}' 2>/dev/null || true",
          { cwd: repoPath, encoding: "utf-8", timeout: 10_000 },
        ).trim();
        const appExited = appState.split("\n").some(
          (l) => /app.*exited/i.test(l) || /web.*exited/i.test(l),
        );
        if (appExited) {
          console.log("[Startup] App container crashed during post-start — restarting it with migrated DB...");
          execSync("docker compose up -d --no-deps app 2>/dev/null || docker compose up -d --no-deps web 2>/dev/null || true", {
            cwd: repoPath,
            stdio: "pipe",
            timeout: 30_000,
          });
          await sleep(3_000); // Give it a moment to start
        }
      } catch {
        /* best effort */
      }
    }

    // Poll compose containers for crashes alongside the port wait so we
    // don't burn the full 300s when the app container exits immediately.
    // Use a timeout that covers the max possible waitForPort duration
    // (base + all extensions) so the crash poll never times out before
    // waitForPort finishes.
    const maxPortWaitMs = 300_000 + MAX_PORT_WAIT_EXTENSIONS * PORT_WAIT_EXTENSION_MS;
    const composeCrashPromise = pollComposeContainersAlive(repoPath, maxPortWaitMs);
    try {
      await Promise.race([
        waitForPort(config.port, 300_000, config.healthCheckPath, repoPath, analyzeLogsFn, analyzeResponseFn),
        composeCrashPromise,
      ]);
    } catch (err) {
      logDockerFailure(repoPath);
      // Enrich with diagnostics from the crashed container
      const appContainer = findComposeAppContainer(repoPath);
      if (appContainer) {
        const diagnostics = gatherContainerDiagnostics(appContainer);
        if (diagnostics) {
          throw new Error(`${toErrorMessage(err)}\n\nContainer diagnostics:\n${diagnostics}`);
        }
      }
      throw err;
    }
  } else {
    // Non-docker or docker without --wait
    const portTimeoutMs = config.docker ? 180_000 : 90_000;

    // Run post-start commands (e.g. DB migrations) if any
    if (config.postStartCommands?.length) {
      // Give the app a moment to boot before running post-start commands
      await sleep(5_000);
      await runPostStartCommands(config, repoPath);
    }

    // For `docker run -d`, the shell exits immediately with code 0 after
    // detaching the container.  The container may crash independently.
    // Poll for container health alongside the port check.
    // Use --name if available, otherwise pick up container IDs from stdout.
    const containerName = command.match(/--name\s+(\S+)/)?.[1];

    // Resolve the container identifier: explicit name > last detected ID from stdout
    const resolveContainerId = (): string | undefined =>
      containerName ?? detectedContainerIds[detectedContainerIds.length - 1];

    // Stream logs from the app container so we see progress during port wait
    let logTailer: ChildProcess | undefined;
    const startLogTail = (): void => {
      const cid = resolveContainerId();
      if (!cid || logTailer) return;
      try {
        logTailer = spawn("docker", ["logs", "-f", "--tail", "0", cid], {
          stdio: ["ignore", "pipe", "pipe"],
        });
        if (logTailer.stdout) {
          const rl = createInterface({ input: logTailer.stdout });
          rl.on("line", (line) => console.log(`[Container] ${line}`));
        }
        if (logTailer.stderr) {
          const rl = createInterface({ input: logTailer.stderr });
          rl.on("line", (line) => console.log(`[Container] ${line}`));
        }
        logTailer.on("error", () => {}); // ignore
      } catch { /* ignore */ }
    };

    // Give the shell a moment to print container IDs, then start tailing
    setTimeout(startLogTail, 2_000);

    const containerCrashPromise = containerName
      ? pollContainerAlive(containerName, portTimeoutMs)
      : (async () => {
          // Wait for the shell to print container IDs from docker run -d
          await sleep(3_000);
          // Also retry log tailing in case IDs arrived after the first attempt
          startLogTail();
          const cid = resolveContainerId();
          if (cid) return pollContainerAlive(cid, portTimeoutMs);
          return new Promise<never>(() => {});
        })();

    try {
      await Promise.race([
        waitForPort(config.port, portTimeoutMs, config.healthCheckPath, config.docker ? repoPath : undefined, analyzeLogsFn, analyzeResponseFn),
        earlyExitPromise,
        containerCrashPromise,
      ]);
    } catch (err) {
      if (config.docker) logDockerFailure(repoPath);
      // Enrich error with container diagnostics so the repair LLM
      // has full context (port mappings, processes, app logs inside container)
      const cid = resolveContainerId();
      if (cid) {
        const diagnostics = gatherContainerDiagnostics(cid);
        if (diagnostics) {
          const origMsg = toErrorMessage(err);
          if (child.exitCode === null) child.kill("SIGTERM");
          throw new Error(`${origMsg}\n\nContainer diagnostics:\n${diagnostics}`);
        }
      }
      if (child.exitCode === null) {
        child.kill("SIGTERM");
      }
      throw err;
    } finally {
      if (logTailer && logTailer.exitCode === null) {
        logTailer.kill("SIGTERM");
      }
    }
  }

  return child;
}

/**
 * Run post-start commands between app startup and the health check.
 * These are commands like DB migrations that need the container running
 * but must complete before the app can serve healthy responses.
 */
async function runPostStartCommands(config: StartupConfig, repoPath: string): Promise<void> {
  if (!config.postStartCommands?.length) return;

  for (let cmd of config.postStartCommands) {
    // Skip streaming/follow-mode commands that would hang forever
    if (isStreamingCommand(cmd)) {
      console.warn(`[Startup] Skipping streaming post-start command: ${cmd}`);
      continue;
    }

    // Inject env vars into docker compose run/exec commands so they reach
    // the container (host env vars don't automatically pass through).
    cmd = injectComposeEnvFlags(cmd, config.envVars);

    console.log(`[Startup] Running post-start command: ${cmd}`);
    try {
      const output = execSync(cmd, {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 120_000,
        maxBuffer: 50 * 1024 * 1024,
        env: { ...process.env, ...config.envVars },
      });
      const lines = output.trim().split("\n");
      const tail = lines.slice(-5).join("\n");
      if (tail) console.log(`[Startup] Post-start output (last 5 lines):\n${tail}`);
    } catch (err) {
      const errMsg = toErrorMessage(err);
      console.warn(`[Startup] Post-start command failed: ${errMsg}`);

      // If the container died, try `docker compose run --rm` as fallback.
      // This handles the common case: app crashes on boot because DB isn't
      // migrated yet, but migrations themselves can run in a fresh container.
      if (/not running|is not running|no such container/i.test(errMsg)) {
        const fallbackCmd = cmd
          .replace(/docker\s+compose\s+exec\s+(-T\s+)?/g, "docker compose run --rm ")
          .replace(/docker\s+exec\s+(-it?\s+)?(\S+)/g, "docker compose run --rm app");
        if (fallbackCmd !== cmd) {
          console.log(`[Startup] Container dead — retrying with 'run --rm': ${fallbackCmd}`);
          try {
            const output = execSync(fallbackCmd, {
              cwd: repoPath,
              encoding: "utf-8",
              timeout: 180_000,
              maxBuffer: 50 * 1024 * 1024,
              env: { ...process.env, ...config.envVars },
            });
            const lines = output.trim().split("\n");
            const tail = lines.slice(-5).join("\n");
            if (tail) console.log(`[Startup] Post-start output (last 5 lines):\n${tail}`);
          } catch (retryErr) {
            console.warn(`[Startup] Fallback post-start also failed: ${toErrorMessage(retryErr)}`);
          }
        }
      }
      // Don't throw — let the health check determine if the app is working
    }
  }
}

/**
 * Run a prerequisite command with real-time output streaming.
 * Logs a progress summary every 30s so long-running commands (e.g. db:prepare)
 * aren't a black box. Throws on non-zero exit or timeout.
 */
function runPrerequisite(
  cmd: string,
  cwd: string,
  envVars: Record<string, string>,
): Promise<void> {
  const BASE_TIMEOUT_MS = 600_000; // 10 min base
  const EXTENSION_MS = 300_000;    // 5 min per extension
  const MAX_EXTENSIONS = 5;        // up to 25 min extra → 35 min max
  // "Still making progress" = new output appeared in the last 60s
  const STALL_THRESHOLD_MS = 60_000;

  return new Promise((resolve, reject) => {
    const child = spawn("sh", ["-c", cmd], {
      cwd,
      env: { ...process.env, ...envVars },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const outputLines: string[] = [];
    let lastProgressLog = Date.now();
    const progressInterval = 30_000;
    let lastLine = "";
    let lastOutputTime = Date.now();

    const onLine = (line: string): void => {
      outputLines.push(line);
      lastLine = line;
      lastOutputTime = Date.now();
      // Periodic progress report
      if (Date.now() - lastProgressLog > progressInterval) {
        lastProgressLog = Date.now();
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(
          `[Startup] Prerequisite still running (${elapsed}s): ${lastLine.slice(0, 200)}`,
        );
      }
    };

    if (child.stdout) {
      const rl = createInterface({ input: child.stdout });
      rl.on("line", onLine);
    }
    if (child.stderr) {
      const rl = createInterface({ input: child.stderr });
      rl.on("line", onLine);
    }

    const startTime = Date.now();
    let effectiveTimeoutMs = BASE_TIMEOUT_MS;
    let extensionsGranted = 0;
    let settled = false;

    // Check every 30s if we're near the deadline and output is still flowing
    const extensionCheck = setInterval(() => {
      if (settled) return;
      const elapsed = Date.now() - startTime;
      const remaining = effectiveTimeoutMs - elapsed;

      // Near the deadline? Check if we should extend.
      if (remaining < 60_000 && extensionsGranted < MAX_EXTENSIONS) {
        const sinceLastOutput = Date.now() - lastOutputTime;
        if (sinceLastOutput < STALL_THRESHOLD_MS) {
          // Output still flowing — extend
          extensionsGranted++;
          effectiveTimeoutMs += EXTENSION_MS;
          const totalExtra = extensionsGranted * EXTENSION_MS / 1000;
          console.log(
            `[Startup] Prerequisite still producing output — extending timeout by ${EXTENSION_MS / 1000}s `
            + `(extension ${extensionsGranted}/${MAX_EXTENSIONS}, +${totalExtra}s total)`,
          );
        } else {
          // Output stalled — let it time out
          console.log(`[Startup] Prerequisite output stalled for ${Math.round(sinceLastOutput / 1000)}s — will not extend`);
        }
      }

      // Hard timeout — kill it
      if (elapsed >= effectiveTimeoutMs) {
        settled = true;
        clearInterval(extensionCheck);
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5_000);
        const tail = outputLines.slice(-20).join("\n");
        let msg = `Prerequisite timed out after ${Math.round(elapsed / 1000)}s: ${cmd}`;
        if (extensionsGranted > 0) {
          msg += ` (extended ${extensionsGranted}x from ${BASE_TIMEOUT_MS / 1000}s because output was still flowing)`;
        }
        msg += `\n\nLast output:\n${tail}`;
        reject(new Error(msg));
      }
    }, 30_000);

    child.on("error", (err) => {
      settled = true;
      clearInterval(extensionCheck);
      reject(new Error(`Prerequisite failed to start: ${err.message}`));
    });

    child.on("close", (code) => {
      settled = true;
      clearInterval(extensionCheck);
      if (code === 0) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`[Startup] Prerequisite completed in ${elapsed}s`);
        resolve();
      } else {
        const tail = outputLines.slice(-30).join("\n");
        reject(
          new Error(
            `Command failed: ${cmd}\nExit code: ${code}\n\n${tail}`,
          ),
        );
      }
    });
  });
}

/**
 * Gather diagnostic information from a Docker container so the repair LLM
 * gets rich context about why a container isn't serving on the expected port.
 * Captures port mappings, processes, stdout/stderr, and application logs.
 */
function gatherContainerDiagnostics(containerId: string): string {
  const sections: string[] = [];
  const run = (cmd: string, label: string, timeout = 5_000): void => {
    try {
      const out = execSync(cmd, { encoding: "utf-8", timeout }).trim();
      if (out) sections.push(`${label}:\n${out}`);
    } catch { /* ignore */ }
  };

  run(`docker port ${containerId}`, "Port mappings");
  run(
    `docker inspect --format='{{json .NetworkSettings.Ports}}' ${containerId}`,
    "Network port config",
  );
  run(
    `docker exec ${containerId} ps aux 2>&1 | head -30`,
    "Processes inside container",
    10_000,
  );
  run(
    `docker logs ${containerId} 2>&1 | tail -50`,
    "Container stdout/stderr (last 50 lines)",
    10_000,
  );
  run(
    `docker exec ${containerId} bash -c 'for f in /app/log/*.log /src/log/*.log /var/log/app/*.log /tmp/*.log; do [ -f "$f" ] && echo "=== $f ===" && tail -20 "$f"; done' 2>&1 | head -80`,
    "Application logs inside container",
    10_000,
  );

  return sections.join("\n\n") || "";
}

function logDockerFailure(repoPath: string): void {
  try {
    const ps = execSync(
      "docker compose ps --format '{{.Name}} {{.Status}}' 2>/dev/null || true",
      {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 10_000,
      },
    ).trim();
    if (ps) console.log(`[Startup] Docker container status:\n${ps}`);

    const logs = execSync("docker compose logs --tail=40 2>/dev/null || true", {
      cwd: repoPath,
      encoding: "utf-8",
      timeout: 15_000,
    }).trim();
    if (logs)
      console.log(
        `[Startup] Docker logs (last 40 lines):\n${logs.slice(-3000)}`,
      );
  } catch {
    /* ignore */
  }
}

// Timeout extension constants — shared between waitForPort and pollComposeContainersAlive
// so the crash poll doesn't time out before waitForPort finishes with extensions.
const MAX_PORT_WAIT_EXTENSIONS = 5;
const PORT_WAIT_EXTENSION_MS = 180_000; // 3 minutes per extension

export async function waitForPort(
  port: number,
  timeoutMs: number,
  healthCheckPath = "/",
  repoPath?: string,
  analyzeLogsFn?: LogAnalyzer,
  analyzeResponseFn?: (status: number, body: string) => Promise<{ healthy: boolean; reason: string }>,
): Promise<void> {
  const start = Date.now();
  const interval = 2_000;
  let lastStatus: number | undefined;
  let lastBody = "";
  const probePath = healthCheckPath.startsWith("/") ? healthCheckPath : `/${healthCheckPath}`;
  let lastLogSnapshot = "";
  let lastLogCheckTime = 0;
  const logCheckInterval = 20_000; // check container logs every 20s
  let analysisInFlight = false;
  let fatalDiagnosis = "";
  let consecutive500s = 0;
  const max500sBeforeFail = 5; // fail fast after 5 consecutive 500s (~10s)
  let consecutiveGatewayErrors = 0;
  // Gateway errors (502/503/504) during boot are normal — the reverse proxy
  // is up but the backend (uwsgi, gunicorn, puma) isn't ready yet. Give them
  // a much longer grace window, especially when the AI confirms "still progressing".
  const MAX_GATEWAY_ERRORS_BEFORE_FAIL = 60; // ~2 minutes at 2s interval
  let consecutiveConnFailures = 0; // track connection refused / reset
  let localhostBindingChecked = false; // only check once
  let responseAnalysisDone = false; // only analyze once per health check cycle
  let progressCount = 0; // how many times AI reported "still progressing"
  let extensionsGranted = 0;
  let effectiveTimeoutMs = timeoutMs;
  let portHasEverResponded = false; // got ANY HTTP response (even 5xx) at least once

  while (Date.now() - start < effectiveTimeoutMs) {
    // If the AI flagged a fatal error, stop waiting immediately
    if (fatalDiagnosis) {
      let errMsg = `Application failed on port ${port}: ${fatalDiagnosis}`;
      if (lastStatus) errMsg += ` (last HTTP status: ${lastStatus})`;
      if (lastBody && lastBody !== fatalDiagnosis) errMsg += `\n\nHTTP response body:\n${lastBody}`;
      if (repoPath) {
        const logs = getContainerLogTail(repoPath, 40);
        if (logs) errMsg += `\n\nContainer logs:\n${logs}`;
      }
      throw new StartupFailedError(errMsg);
    }

    try {
      const response = await fetch(`http://localhost:${port}${probePath}`, {
        method: "GET",
        headers: probeHeaders(probePath),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_QUICK),
      });
      lastStatus = response.status;
      portHasEverResponded = true;
      // Accept any non-server-error response as potentially healthy.
      // But ask the AI to verify the response looks like a real working app.
      if (response.status < 500) {
        consecutive500s = 0;
        consecutiveGatewayErrors = 0;
        consecutiveConnFailures = 0; // got a real response

        // Read the body for AI analysis
        let responseBody = "";
        try {
          responseBody = await response.text();
        } catch { /* ignore */ }

        // Ask AI if this response looks healthy (only once to avoid spamming)
        if (analyzeResponseFn && !responseAnalysisDone && responseBody.length > 0) {
          responseAnalysisDone = true;
          // Strip HTML tags/scripts/styles so the AI sees actual text content
          // (avoids wasting the 3000-char window on <head> CSS/JS noise)
          const textContent = (response.headers.get("content-type") ?? "").includes("html")
            ? stripHtmlForAnalysis(responseBody)
            : responseBody;
          const bodyPreview = textContent.length > 3000 ? textContent.slice(0, 3000) + "..." : textContent;
          try {
            const result = await analyzeResponseFn(response.status, bodyPreview);
            if (!result.healthy) {
              console.log(`[Startup] AI response analysis: UNHEALTHY — ${result.reason}`);
              let errMsg = `Application on port ${port} returned HTTP ${response.status} but response is not healthy: ${result.reason}`;
              errMsg += `\n\nHTTP response body:\n${bodyPreview}`;
              if (repoPath) {
                const logs = getContainerLogTail(repoPath, 40);
                if (logs) errMsg += `\n\nContainer logs:\n${logs}`;
              }
              throw new StartupFailedError(errMsg);
            }
            console.log(`[Startup] AI response analysis: healthy — ${result.reason}`);
          } catch (err) {
            if (err instanceof StartupFailedError) throw err;
            // AI analysis itself failed — fall through to accept
            console.log(`[Startup] AI response analysis failed, accepting response as healthy`);
          }
        }

        return;
      }

      // Always capture the 500 body — it contains the actual error
      try {
        const text = await response.text();
        lastBody = extractErrorFromHtml(text);
      } catch { /* ignore body read failure */ }

      // Distinguish gateway errors (502/503/504) from real app errors (500).
      // Gateway errors mean the reverse proxy (nginx, caddy) is up but the
      // backend (uwsgi, gunicorn, puma) isn't ready — normal during boot.
      const isGatewayError = response.status === 502 || response.status === 503 || response.status === 504;

      if (isGatewayError) {
        consecutiveGatewayErrors++;
        consecutive500s = 0; // reset real-500 counter
        // If the AI has been reporting "still progressing", extend the
        // gateway patience dynamically — the backend is clearly booting.
        const gatewayLimit = progressCount > 0
          ? MAX_GATEWAY_ERRORS_BEFORE_FAIL * 2  // ~4 minutes if AI says progressing
          : MAX_GATEWAY_ERRORS_BEFORE_FAIL;
        if (consecutiveGatewayErrors >= gatewayLimit) {
          let errMsg = `Application returning HTTP ${response.status} (gateway error) persistently on port ${port} — backend never became ready`;
          if (lastBody) errMsg += `\n\nHTTP ${response.status} response body:\n${lastBody}`;
          if (repoPath) {
            const logs = getContainerLogTail(repoPath, 40);
            if (logs) errMsg += `\n\nContainer logs:\n${logs}`;
          }
          throw new StartupFailedError(errMsg);
        }
        // Log sparingly — every 10th occurrence (~20s)
        if (consecutiveGatewayErrors % 10 === 1) {
          console.log(
            `[Startup] Port ${port} responding with HTTP ${response.status} (gateway error ${consecutiveGatewayErrors}/${gatewayLimit}) — backend not ready yet, waiting...`,
          );
        }
      } else {
        // Real 500 errors — the app is running but broken
        consecutive500s++;
        consecutiveGatewayErrors = 0;
        if (consecutive500s >= max500sBeforeFail) {
          let errMsg = `Application returning HTTP ${response.status} persistently on port ${port}`;
          if (lastBody) errMsg += `\n\nHTTP ${response.status} response body:\n${lastBody}`;
          if (repoPath) {
            const logs = getContainerLogTail(repoPath, 40);
            if (logs) errMsg += `\n\nContainer logs:\n${logs}`;
          }
          throw new StartupFailedError(errMsg);
        }
        console.log(
          `[Startup] Port ${port} responding with HTTP ${response.status} (${consecutive500s}/${max500sBeforeFail}) — will fail fast if persistent...`,
        );
      }
    } catch (err) {
      if (err instanceof StartupFailedError) throw err;
      // Connection refused / timeout — server not ready yet
      consecutiveConnFailures++;

      // After 10 consecutive connection failures (~20s) for Docker apps,
      // check whether the server is bound to 127.0.0.1 inside the container
      // — a very common Docker misconfiguration where the internal curl works
      // but the host-side port mapping can't reach the app.
      if (repoPath && !localhostBindingChecked && consecutiveConnFailures >= 10) {
        localhostBindingChecked = true;
        const binding = detectLocalhostBinding(repoPath, port);
        if (binding?.boundToLocalhost) {
          console.log(`[Startup] Detected localhost binding issue — app on port ${port} is bound to 127.0.0.1 inside container ${binding.containerId}`);
          let errMsg = `Application is running inside the container but the server is bound to 127.0.0.1 (localhost only) on port ${port}. `
            + `Docker port forwarding cannot reach it because traffic arrives on the container's external network interface, not loopback.\n\n`
            + `FIX: The application must bind to 0.0.0.0 (all interfaces) instead of 127.0.0.1. `
            + `Add the appropriate environment variable to the service in compose.yml. Common options:\n`
            + `  - Rails/Puma: BINDING=0.0.0.0  or  add "-b 0.0.0.0" to the command\n`
            + `  - Node.js/Express: HOST=0.0.0.0\n`
            + `  - Django/Gunicorn: BIND=0.0.0.0:${port}\n`
            + `  - Generic: HOST=0.0.0.0 or BIND_ADDRESS=0.0.0.0\n`
            + `  - Or set command to include "--binding 0.0.0.0" / "--host 0.0.0.0" / "-b 0.0.0.0" as appropriate for the framework`;
          if (repoPath) {
            const logs = getContainerLogTail(repoPath, 40);
            if (logs) errMsg += `\n\nContainer logs:\n${logs}`;
          }
          throw new StartupFailedError(errMsg);
        }
      }
    }

    // Periodically ask the LLM to analyze container logs
    if (repoPath && !analysisInFlight && Date.now() - lastLogCheckTime > logCheckInterval) {
      const snapshot = getContainerLogTail(repoPath, 40);
      if (snapshot && snapshot !== lastLogSnapshot) {
        lastLogSnapshot = snapshot;
        lastLogCheckTime = Date.now();

        if (analyzeLogsFn) {
          analysisInFlight = true;
          const analysisCtx: LogAnalyzerContext = {
            hostPortReachable: portHasEverResponded,
            consecutiveConnFailures,
            secondsWaiting: Math.floor((Date.now() - start) / 1000),
            port,
          };
          // Fire-and-forget the LLM call — don't block the poll loop.
          // We capture the result and act on it in the next iteration.
          analyzeLogsFn(snapshot, analysisCtx)
            .then((result) => {
              analysisInFlight = false;
              if (result.status === "progress") {
                progressCount++;
                console.log(`[Startup] AI log analysis: still progressing — ${result.summary}`);
              } else if (result.status === "fatal") {
                console.log(`[Startup] AI log analysis: fatal — ${result.summary}`);
                // Signal the poll loop to fail early on the next iteration
                fatalDiagnosis = result.summary;
              } else {
                console.log(`[Startup] AI log analysis: ${result.summary}`);
              }
            })
            .catch(() => { analysisInFlight = false; });
        } else {
          // No LLM available — just note that logs are changing
          lastLogCheckTime = Date.now();
          console.log(`[Startup] Container logs are updating (no AI analysis available)`);
        }
      }
    }

    // If approaching timeout and the AI has been reporting progress, extend
    // the deadline — avoids killing apps that are actively booting (e.g.
    // running database migrations).  Allow multiple extensions up to a cap.
    //
    // Tighter cap when the port has NEVER responded: in that case logs may
    // be claiming "listening on PORT" while a binding/port-mapping issue
    // means the host can't actually reach it.  Allow at most 1 grace
    // extension in that scenario instead of MAX_PORT_WAIT_EXTENSIONS, so we
    // don't loop indefinitely on a misconfigured app.
    const remaining = effectiveTimeoutMs - (Date.now() - start);
    const extensionCap = portHasEverResponded ? MAX_PORT_WAIT_EXTENSIONS : 1;
    if (remaining < 30_000 && progressCount > 0 && extensionsGranted < extensionCap && analyzeLogsFn && repoPath) {
      const snapshot = getContainerLogTail(repoPath, 40);
      if (snapshot) {
        try {
          const extensionCtx: LogAnalyzerContext = {
            hostPortReachable: portHasEverResponded,
            consecutiveConnFailures,
            secondsWaiting: Math.floor((Date.now() - start) / 1000),
            port,
          };
          const result = await analyzeLogsFn(snapshot, extensionCtx);
          if (result.status === "fatal") {
            // AI flagged it now (likely once it saw the port-unreachable context)
            fatalDiagnosis = result.summary;
          } else if (result.status === "progress") {
            extensionsGranted++;
            effectiveTimeoutMs += PORT_WAIT_EXTENSION_MS;
            const totalExtra = extensionsGranted * PORT_WAIT_EXTENSION_MS / 1000;
            const reachNote = portHasEverResponded
              ? ""
              : " (port has never responded — capped at 1 grace extension)";
            console.log(`[Startup] AI confirms app is still progressing — extending timeout by ${PORT_WAIT_EXTENSION_MS / 1000}s (extension ${extensionsGranted}/${extensionCap}, +${totalExtra}s total)${reachNote}`);
          }
        } catch { /* ignore analysis failure */ }
      }
    }

    await sleep(interval);
  }

  let errMsg = `Application did not start on port ${port} within ${effectiveTimeoutMs / 1000}s`;
  if (extensionsGranted > 0) errMsg += ` (extended ${extensionsGranted}x from ${timeoutMs / 1000}s because app was progressing)`;
  if (lastStatus) errMsg += ` (last HTTP status: ${lastStatus})`;
  if (lastBody) errMsg += `\n\nHTTP 500 response body:\n${lastBody}`;
  // Attach final container logs so the repair LLM has full context
  if (repoPath) {
    const finalLogs = getContainerLogTail(repoPath, 40);
    if (finalLogs) errMsg += `\n\nContainer logs (last 40 lines):\n${finalLogs}`;
  }
  throw new StartupFailedError(errMsg);
}

/**
 * Grab both the first and last N lines from the compose app container's logs.
 * Exception messages (e.g. Rails, Django) typically appear near the top of
 * output while recent activity is at the tail — capturing both gives the AI
 * the full picture.
 */
function getContainerLogTail(repoPath: string, lines = 30): string {
  try {
    const full = execSync(
      `docker compose logs 2>/dev/null || true`,
      { cwd: repoPath, encoding: "utf-8", timeout: 10_000, maxBuffer: 5 * 1024 * 1024 },
    ).trim();
    if (!full) return "";
    const allLines = full.split("\n");
    if (allLines.length <= lines * 2) return full;
    const head = allLines.slice(0, lines).join("\n");
    const tail = allLines.slice(-lines).join("\n");
    return `${head}\n\n... (${allLines.length - lines * 2} lines omitted) ...\n\n${tail}`;
  } catch {
    return "";
  }
}

/**
 * Extract meaningful error text from an HTML error page.
 * Strips HTML tags and picks out the error/exception section.
 */
function extractErrorFromHtml(html: string): string {
  // Try to find common framework error patterns first
  const patterns = [
    // Rails: "Migrations are pending", exception messages
    /(?:exception|error)[^<]*<[^>]*>([^<]{10,1000})/i,
    /<h1[^>]*>([^<]+)<\/h1>/i,
    /<title>([^<]+)<\/title>/i,
  ];
  const matches: string[] = [];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) matches.push(m[1].trim());
  }

  // Strip all HTML tags and collapse whitespace for a plain-text summary
  const plain = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (matches.length > 0) {
    return matches.join(" | ") + "\n" + plain.slice(0, 500);
  }
  return plain.slice(0, 800);
}

/**
 * Poll all Docker Compose containers and reject if the main app container
 * (the one most likely to serve HTTP) exits.  This prevents waiting the full
 * port-check timeout when a container crashes immediately on startup.
 */
async function pollComposeContainersAlive(
  repoPath: string,
  timeoutMs: number,
): Promise<never> {
  const start = Date.now();
  await sleep(3_000); // give containers a moment to start

  while (Date.now() - start < timeoutMs) {
    try {
      const ps = execSync(
        "docker compose ps -a --format '{{.Name}} {{.State}}' 2>/dev/null || true",
        { cwd: repoPath, encoding: "utf-8", timeout: 5_000 },
      ).trim();
      if (ps) {
        for (const line of ps.split("\n")) {
          const [name, state] = line.trim().split(/\s+/);
          if (!name || !state) continue;
          // Skip infrastructure services — we only care about the app container
          if (/^(postgres|redis|valkey|mysql|mariadb|mongo|memcached|rabbitmq|elasticsearch|opensearch|kafka|zookeeper|minio|mailhog|mailpit)/i.test(name)) continue;
          // Skip background worker containers — they don't serve HTTP
          if (/celery|sidekiq|resque|worker|cron|scheduler|beat/i.test(name)) continue;
          if (state === "exited" || state === "dead") {
            // Grab the exit code for richer error context
            let exitInfo = "";
            try {
              exitInfo = execSync(
                `docker inspect --format='{{.State.ExitCode}}' ${name} 2>/dev/null`,
                { encoding: "utf-8", timeout: 5_000 },
              ).trim();
            } catch { /* ignore */ }

            // One-shot init/migration containers that exit with code 0 are
            // normal — DefectDojo initializer, Rails db:migrate, Django
            // collectstatic, etc. Don't treat them as crashes.
            if (exitInfo === "0") {
              const isInitContainer = /init|migrat|setup|seed|bootstrap|collect|fixture/i.test(name);
              if (isInitContainer) continue; // expected one-shot exit
              // Even non-init containers exiting with code 0 might be fine
              // (e.g. a health-check sidecar). Only flag as crash if the name
              // looks like it should serve HTTP.
              const looksLikeAppServer = /web|app|api|server|uwsgi|gunicorn|puma|nginx|caddy|rails|django|node|flask/i.test(name);
              if (!looksLikeAppServer) continue;
            }

            throw new Error(
              `Compose container "${name}" crashed (state: ${state}${exitInfo ? `, exit code: ${exitInfo}` : ""})`,
            );
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("crashed")) throw err;
      // docker compose ps failed — ignore and retry
    }
    await sleep(3_000);
  }

  // Should never reach here — waitForPort should resolve or reject first
  throw new Error("Compose container health poll timed out");
}

/**
 * Find the main app container name from a Docker Compose project.
 * Returns the first non-infrastructure service container name.
 */
/**
 * Detect if the application inside a Docker container is bound to 127.0.0.1
 * (localhost) only — making it unreachable via Docker port forwarding.
 *
 * Reads /proc/net/tcp inside the container to check the local address for
 * the given port.  Returns a diagnostic object when the port IS listening
 * but only on loopback; `null` when the check is inconclusive.
 */
function detectLocalhostBinding(
  repoPath: string,
  port: number,
): { boundToLocalhost: boolean; containerId: string } | null {
  const containerId = findComposeAppContainer(repoPath);
  if (!containerId) return null;

  try {
    const raw = execSync(
      `docker exec ${containerId} cat /proc/net/tcp /proc/net/tcp6 2>/dev/null || true`,
      { encoding: "utf-8", timeout: 5_000 },
    ).trim();
    if (!raw) return null;

    const portHex = port.toString(16).toUpperCase().padStart(4, "0");
    const lines = raw.split("\n").filter((l) => l.includes(`:${portHex} `));
    if (lines.length === 0) return null; // port not yet listening

    // Check if ANY listener is on a non-loopback address
    // IPv4 loopback: 0100007F  |  IPv4 all-interfaces: 00000000
    // IPv6 loopback: 00000000000000000000000001000000  |  IPv6 all: 00000000000000000000000000000000
    const loopbackIPv4 = "0100007F";
    const loopbackIPv6 = "00000000000000000000000001000000";
    const allIPv4 = "00000000";
    const allIPv6 = "00000000000000000000000000000000";

    let hasListener = false;
    let allOnLoopback = true;

    for (const line of lines) {
      // Only look at LISTEN state (st = 0A)
      const cols = line.trim().split(/\s+/);
      if (cols.length < 4 || cols[3] !== "0A") continue;
      hasListener = true;
      const localAddr = cols[1]?.split(":")[0] ?? "";
      if (localAddr !== loopbackIPv4 && localAddr !== loopbackIPv6
          && localAddr !== allIPv4 && localAddr !== allIPv6) {
        // Some other specific address — treat as non-loopback
        allOnLoopback = false;
      } else if (localAddr === allIPv4 || localAddr === allIPv6) {
        allOnLoopback = false;
      }
    }

    if (!hasListener) return null;
    return { boundToLocalhost: allOnLoopback, containerId };
  } catch {
    return null;
  }
}

function findComposeAppContainer(repoPath: string): string | undefined {
  try {
    const ps = execSync(
      "docker compose ps -a --format '{{.Name}}' 2>/dev/null || true",
      { cwd: repoPath, encoding: "utf-8", timeout: 5_000 },
    ).trim();
    if (!ps) return undefined;
    const infra = /^(postgres|redis|mysql|mongo|memcached|rabbitmq|elasticsearch|kafka|zookeeper)/i;
    for (const name of ps.split("\n")) {
      if (name.trim() && !infra.test(name.trim())) return name.trim();
    }
    // All containers are infra — return the first one
    return ps.split("\n")[0]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Poll a detached Docker container and reject if it stops running.
 * This catches containers that crash immediately after `docker run -d`.
 */
async function pollContainerAlive(
  containerName: string,
  timeoutMs: number,
): Promise<never> {
  const start = Date.now();
  // Give the container a few seconds to start before checking
  await sleep(3_000);

  while (Date.now() - start < timeoutMs) {
    try {
      const status = execSync(
        `docker inspect --format='{{.State.Status}}' ${containerName} 2>/dev/null`,
        { encoding: "utf-8", timeout: 5_000 },
      ).trim();
      if (status === "exited" || status === "dead" || status === "removing") {
        throw new Error(
          `Container "${containerName}" exited unexpectedly (status: ${status})`,
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("exited unexpectedly")) {
        throw err;
      }
      // docker inspect failed — container may not exist yet, ignore
    }
    await sleep(3_000);
  }

  // Should never reach here — waitForPort should resolve or reject first
  throw new Error(`Container health poll timed out`);
}

/**
 * Quick, non-throwing health check: returns true if the app responds on
 * the given port within a short timeout.
 */
// Request headers used by health probes.
//
// Why we don't just send `Accept: *\/*`: some apps (notably Rails apps
// with format negotiation, e.g. Discourse) serve a DIFFERENT response
// based on Accept — a route can return HTTP 200 with a cached
// crawler/JSON variant for the bare-fetch Accept while the real
// browser-rendered HTML throws a 500. If we probe without realistic
// headers we end up cheerfully reporting "healthy" against a page users
// see as broken.
//
// We pick the Accept header based on what the path looks like:
//   - API/JSON-shaped paths (e.g. /api/..., /healthz, /*.json) →
//     `application/json` first, so we exercise the API code path.
//   - Anything else → browser-like `text/html` first, so we exercise
//     the same view rendering a real user would hit.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HTML_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";

const JSON_ACCEPT = "application/json,application/problem+json;q=0.9,*/*;q=0.8";

// Heuristic: does this path look like a JSON/API endpoint vs an HTML page?
// Conservative — when in doubt, treat as HTML (that's the common case and
// matches what a browser would do).
function probeWantsJson(probePath: string): boolean {
  const p = probePath.toLowerCase().split("?")[0]!.split("#")[0]!;
  if (p.endsWith(".json")) return true;
  if (/(^|\/)(api|graphql|rest|rpc|v\d+)(\/|$)/.test(p)) return true;
  // Common JSON-returning health/status endpoints
  if (/(^|\/)(healthz|readyz|livez|ping|status|health|metrics)(\/|$)/.test(p)) {
    return true;
  }
  return false;
}

function probeHeaders(probePath: string): Record<string, string> {
  return {
    Accept: probeWantsJson(probePath) ? JSON_ACCEPT : HTML_ACCEPT,
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": BROWSER_USER_AGENT,
  };
}

export async function checkAppHealth(port: number, healthCheckPath = "/"): Promise<boolean> {
  const probePath = healthCheckPath.startsWith("/") ? healthCheckPath : `/${healthCheckPath}`;
  try {
    const res = await fetch(`http://localhost:${port}${probePath}`, {
      method: "GET",
      headers: probeHeaders(probePath),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_SHORT),
    });
    // Server errors mean the process is listening but the app is broken
    return res.status < 500;
  } catch {
    return false;
  }
}

export interface ResponseHealthResult {
  healthy: boolean;
  reason: string;
}

/**
 * Cached regex fingerprints for a single probed URL path.
 * After the first LLM-based deep probe, subsequent probes use these
 * patterns for a pure HTTP + regex check — no LLM call needed.
 */
interface DeepProbeFingerprint {
  /** Regex that, when matched in the body, means the app is healthy. */
  healthyPattern: RegExp;
  /** Regex that, when matched in the body, means the app is unhealthy. */
  unhealthyPattern: RegExp | null;
  /** The HTTP status seen when the fingerprint was created. */
  expectedStatus: number;
  /** Optional API endpoint path to probe in addition to the HTML page.
   *  If the response looks like an SPA, the LLM suggests a lightweight
   *  API endpoint visible in the page. A 5xx from this endpoint triggers
   *  unhealthy even if the HTML shell is fine. */
  apiProbePath?: string;
}

/**
 * Per-path cache of probe fingerprints. Passed by the caller (orchestrator)
 * so it persists across deep-probe invocations without module-level state.
 */
export type DeepProbeCache = Map<string, DeepProbeFingerprint>;

/**
 * Ask the LLM whether an HTTP response body looks like a real working app
 * vs. a setup-required / dev-mode-warning / error page that happens to
 * return HTTP 200.
 *
 * This is the same prompt used by the startup waiter (see
 * `startApplicationWithRetries`) extracted as a standalone helper so the
 * background health monitor and pre-scan validation can reuse it.
 */
export async function analyzeResponseWithLLM(
  llm: Parameters<typeof chatWithTools>[0],
  modelSelector: ModelSelector | undefined,
  status: number,
  body: string,
): Promise<ResponseHealthResult> {
  const resp = await llm.chat.completions.create({
    model: modelSelector?.current() ?? "gpt-4o-mini",
    max_completion_tokens: 200,
    messages: [
      {
        role: "system",
        content: `You are checking if a web application's HTTP response indicates a FULLY WORKING application ready for real users.

Respond with EXACTLY one JSON object:
{"healthy": true/false, "reason": "<one sentence explanation>"}

Mark as UNHEALTHY (healthy: false) if the response contains ANY of these:
- Pages that tell the user to run a command, set an environment variable, or edit a config file before the app works (e.g. "Ember CLI is Required", "run bin/setup", "set DATABASE_URL")
- Error pages (500, 503, "something went wrong", stack traces)
- "Service unavailable", "under maintenance", or placeholder pages
- Database migration needed, pending migrations
- Configuration required, environment variable missing
- Framework default welcome pages that are NOT real app UI (Rails "Yay! You're on Rails!", Django debug page, etc.)
- Blank or nearly empty pages with just a title and no real content (but NOT SPA shells with JavaScript bundles — those are valid, and NOT minimal health/status endpoints — those are also valid)
- JSON error responses like {"error": ...} or {"errors": [...]}

Mark as HEALTHY (healthy: true) if the response is a WORKING application page:
- A real login form, registration form, or sign-up page
- A dashboard, feed, or content page with actual data
- A JSON API response with real data (not an error)
- A working application UI with navigation, content, and interactive elements
- A web-based setup wizard or "finish installation" form where the user can register an admin account through the browser — this is a NORMAL first-run state and the application IS working correctly
- Any page served by the application framework (not a raw web server error) that accepts user interaction
- A minimal health/status endpoint response such as "ok", "OK", "healthy", "pong", "alive", or a short JSON like {"status":"ok"} — these are VALID health responses even if the body is very short
- **A Single-Page Application (SPA) shell** — HTML with a root element like <app-root>, <consumer-root>, <div id="root">, <div id="app">, <next-root>, etc. and references to JavaScript bundles (main.js, chunk-*.js, vendor.js, runtime.js, polyfills.js). The HTML body appears minimal because the actual UI is rendered client-side by JavaScript. This is the CORRECT healthy response for Angular, React, Vue, Next.js, and other SPA frameworks — mark it HEALTHY.
- **A page served by nginx/Apache/CDN** with proper assets (CSS, JS, fonts) and an app title — even if the body text looks empty after stripping HTML tags, the presence of bundled assets and a framework root element means the app is running correctly.

When in doubt about whether the app is running vs broken, check: does the page come from the application framework and accept user interaction? If yes → HEALTHY. If it just shows a static error or tells you to run commands → UNHEALTHY.`,
      },
      {
        role: "user",
        content: `HTTP ${status} response body:\n\`\`\`\n${body}\n\`\`\``,
      },
    ],
  });
  try {
    const text = resp.choices[0]?.message.content ?? "";
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    return {
      healthy: json.healthy === true,
      reason: String(json.reason ?? "").slice(0, 200) || "no reason given",
    };
  } catch {
    return { healthy: true, reason: "failed to parse AI response — assuming healthy" };
  }
}

/**
 * LLM call that analyzes a response AND generates reusable regex fingerprints.
 * Called only on the first deep probe for a given path; subsequent probes use
 * the cached fingerprint for a pure HTTP + regex check.
 */
async function analyzeAndFingerprint(
  llm: Parameters<typeof chatWithTools>[0],
  modelSelector: ModelSelector | undefined,
  status: number,
  body: string,
  probePath?: string,
): Promise<ResponseHealthResult & { fingerprint?: DeepProbeFingerprint }> {
  const resp = await llm.chat.completions.create({
    model: modelSelector?.current() ?? "gpt-4o-mini",
    max_completion_tokens: 400,
    messages: [
      {
        role: "system",
        content: `You are checking if a web application's HTTP response indicates a FULLY WORKING application.

Respond with EXACTLY one JSON object:
{
  "healthy": true/false,
  "reason": "<one sentence>",
  "healthyRegex": "<regex pattern that matches something unique in the body that proves the app is healthy>",
  "unhealthyRegex": "<regex pattern that matches error indicators, or empty string if none>",
  "apiProbePath": "<lightweight API endpoint path visible in the page, or empty string>"
}

For healthyRegex: pick a distinctive string/pattern from the response body that would ONLY appear when the app is working correctly. Examples:
- A page title like "DefectDojo" or "Discourse"
- A navigation element like "Dashboard|Settings|Profile"
- A login form indicator like "csrfmiddlewaretoken|password"
- An API response key like "status.*ok|results"
- An SPA root element like "app-root|id=\\"root\\"|id=\\"app\\""
- A health endpoint like "^ok$|^healthy$|status.*ok"
The regex should be simple, reliable, and match on the stripped/text version of the body.

For unhealthyRegex: pick patterns that indicate breakage if they appear. Examples:
- "Internal Server Error|stack.?trace|Traceback|ENOENT"
- "run bin/setup|set DATABASE_URL|migration.*pending"
- "" (empty string if the healthy response has no obvious error markers to watch for)
IMPORTANT: The unhealthyRegex must NOT match content that is inherently expected for the
probed path. For example if probing /robots.txt, do NOT use User-agent or Disallow patterns
as unhealthy signals — that IS the expected content. Only flag actual error indicators.

For apiProbePath: if the response is an SPA (React, Angular, Vue, Ember, etc.) that loads
its content from API calls, suggest a lightweight GET API endpoint visible in the page source
(e.g. from script tags, __initialData, API base URLs). This lets us verify the backend API
layer is working even when the HTML shell looks fine. Examples:
- "/api/0/internal/health/" (Sentry)
- "/api/v2/users/me" (generic REST)
- "/graphql" (GraphQL endpoint — will just check for non-5xx)
- "" (empty string if not an SPA, or if no API path is visible in the page)

UNHEALTHY indicators: error pages, stack traces, "run a command"/"set env var" pages, framework defaults ("Yay! You're on Rails!"), blank pages (NOT SPA shells), JSON errors.
HEALTHY indicators: login forms, dashboards, API data, SPA shells with JS bundles, health endpoint "ok"/"healthy", setup wizards.`,
      },
      {
        role: "user",
        content: `HTTP ${status} response from ${probePath ?? "unknown path"}:\n\`\`\`\n${body}\n\`\`\``,
      },
    ],
  });

  try {
    const text = resp.choices[0]?.message.content ?? "";
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    const result: ResponseHealthResult = {
      healthy: json.healthy === true,
      reason: String(json.reason ?? "").slice(0, 200) || "no reason given",
    };

    // Build fingerprint from the LLM's regex suggestions
    let fingerprint: DeepProbeFingerprint | undefined;
    const healthyRaw = String(json.healthyRegex ?? "").trim();
    if (healthyRaw) {
      try {
        const healthyPattern = new RegExp(healthyRaw, "i");
        let unhealthyPattern: RegExp | null = null;
        const unhealthyRaw = String(json.unhealthyRegex ?? "").trim();
        if (unhealthyRaw) {
          try {
            unhealthyPattern = new RegExp(unhealthyRaw, "i");
          } catch { /* ignore bad regex */ }
        }
        fingerprint = { healthyPattern, unhealthyPattern, expectedStatus: status };
        // Include API probe path from LLM if provided
        const apiPath = String(json.apiProbePath ?? "").trim();
        if (apiPath && apiPath.startsWith("/")) {
          fingerprint.apiProbePath = apiPath;
        }
        console.log(
          `[AppHealth] Deep probe fingerprint: healthy=/${healthyRaw}/i` +
            (unhealthyRaw ? ` unhealthy=/${unhealthyRaw}/i` : "") +
            (fingerprint.apiProbePath ? ` api=${fingerprint.apiProbePath}` : ""),
        );
      } catch {
        // LLM produced an invalid regex — proceed without fingerprint
        console.warn(`[AppHealth] LLM produced invalid healthyRegex: ${healthyRaw}`);
      }
    }

    return { ...result, fingerprint };
  } catch {
    return { healthy: true, reason: "failed to parse AI response — assuming healthy" };
  }
}

/**
 * Body-aware health probe. Fetches the health-check URL and asks the LLM to
 * judge whether the response is from a real working app — catches cases
 * where the app returns HTTP 200 with a dev-mode warning page, a setup
 * required page, or a framework error that the status-code-only check would
 * miss.
 *
 * When a dedicated healthCheckPath is configured (i.e. not "/"), this also
 * probes "/" (the root page) with browser-like headers. This catches the
 * common case where a tiny health endpoint (e.g. /srv/status → "ok") is
 * perfectly healthy while every real user-facing page returns a 500. Both
 * the health endpoint AND the root page must be healthy for the deep probe
 * to pass.
 *
 * Used by AppHealthMonitor periodically (every Nth shallow probe) and
 * synchronously before each scan round.
 */
export async function deepHealthCheck(
  port: number,
  healthCheckPath: string,
  llm: Parameters<typeof chatWithTools>[0],
  modelSelector: ModelSelector | undefined,
  cache?: DeepProbeCache,
): Promise<ResponseHealthResult> {
  // 1. Probe the configured health endpoint
  const healthResult = await deepProbeSingleUrl(port, healthCheckPath, llm, modelSelector, cache);
  if (!healthResult.healthy) return healthResult;

  // 2. If the health endpoint is not "/" itself, also probe the root page.
  const normalizedHealth = healthCheckPath.replace(/\/+$/, "") || "/";
  if (normalizedHealth !== "/") {
    const rootResult = await deepProbeSingleUrl(port, "/", llm, modelSelector, cache);
    if (!rootResult.healthy) {
      return {
        healthy: false,
        reason: `health endpoint (${healthCheckPath}) is ok, but root page (/) is broken: ${rootResult.reason}`,
      };
    }
  }

  // 3. API layer probe: if any cached fingerprint includes an apiProbePath
  //    (typically discovered from an SPA page), verify the backend API is
  //    responding. An SPA shell can serve a perfect 200 HTML page while the
  //    API layer it depends on is 500-ing.
  if (cache) {
    for (const [, fp] of cache) {
      if (!fp.apiProbePath) continue;
      try {
        const apiRes = await fetch(`http://localhost:${port}${fp.apiProbePath}`, {
          method: "GET",
          headers: probeHeaders(fp.apiProbePath),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MEDIUM),
        });
        if (apiRes.status >= 500) {
          return {
            healthy: false,
            reason: `API probe ${fp.apiProbePath} returned HTTP ${apiRes.status} — backend is broken while HTML shell may look fine`,
          };
        }
      } catch (err) {
        return {
          healthy: false,
          reason: `API probe ${fp.apiProbePath} failed: ${toErrorMessage(err)}`,
        };
      }
      break; // only probe the first API path found
    }
  }

  return healthResult;
}

/**
 * Probe a single URL. If a cached fingerprint exists for this path,
 * validates with pure HTTP + regex. Otherwise calls the LLM to analyze
 * the response AND generate a fingerprint for future probes.
 */
async function deepProbeSingleUrl(
  port: number,
  path: string,
  llm: Parameters<typeof chatWithTools>[0],
  modelSelector: ModelSelector | undefined,
  cache?: DeepProbeCache,
): Promise<ResponseHealthResult> {
  const probePath = path.startsWith("/") ? path : `/${path}`;
  let res: Response;
  try {
    res = await fetch(`http://localhost:${port}${probePath}`, {
      method: "GET",
      headers: probeHeaders(probePath),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MEDIUM),
    });
  } catch (err) {
    return { healthy: false, reason: `connection failed on ${probePath}: ${toErrorMessage(err)}` };
  }
  if (res.status >= 500) {
    return { healthy: false, reason: `HTTP ${res.status} server error on ${probePath}` };
  }
  let body = "";
  try {
    body = await res.text();
  } catch {
    /* empty body OK */
  }
  if (!body) return { healthy: true, reason: `empty body on ${probePath}, status acceptable` };
  const ct = res.headers.get("content-type") ?? "";
  const text = ct.includes("html") ? stripHtmlForAnalysis(body) : body;

  // Fast path: use cached fingerprint if available
  const cached = cache?.get(probePath);
  if (cached) {
    return applyFingerprint(cached, res.status, text, probePath);
  }

  // Slow path: LLM analysis + fingerprint generation
  const preview = text.length > 3000 ? text.slice(0, 3000) + "..." : text;
  const result = await analyzeAndFingerprint(llm, modelSelector, res.status, preview, probePath);

  // Cache the fingerprint for future probes
  if (result.fingerprint && cache) {
    // Validate the fingerprint actually works on the current response
    // before caching — prevents caching a bad regex that would always
    // report the opposite of reality.
    const check = applyFingerprint(result.fingerprint, res.status, text, probePath);
    if (check.healthy === result.healthy) {
      cache.set(probePath, result.fingerprint);
    } else {
      console.warn(
        `[AppHealth] Fingerprint didn't match LLM verdict for ${probePath} — not caching`,
      );
    }
  }

  return { healthy: result.healthy, reason: result.reason };
}

/**
 * Apply a cached fingerprint to a response body. Checks the unhealthy
 * pattern first (error signals take priority), then the healthy pattern.
 */
function applyFingerprint(
  fp: DeepProbeFingerprint,
  status: number,
  text: string,
  path: string,
): ResponseHealthResult {
  // Status code regression (was 200, now 500+)
  if (status >= 500) {
    return { healthy: false, reason: `HTTP ${status} server error on ${path} (was ${fp.expectedStatus})` };
  }

  // Check for unhealthy signals first — but skip if the healthy pattern
  // ALSO matches. When the probe endpoint IS the content the unhealthy
  // pattern targets (e.g. /robots.txt returning robots.txt content),
  // the healthy match takes priority since the response is expected.
  const unhealthyMatch = fp.unhealthyPattern?.test(text) ?? false;
  const healthyMatch = fp.healthyPattern.test(text);

  if (unhealthyMatch && !healthyMatch) {
    return {
      healthy: false,
      reason: `error pattern matched on ${path}: ${fp.unhealthyPattern!.source}`,
    };
  }

  // Check for healthy signals
  if (healthyMatch) {
    return { healthy: true, reason: `fingerprint match on ${path}` };
  }

  // Healthy pattern disappeared — the app content changed unexpectedly
  return {
    healthy: false,
    reason: `expected content missing on ${path} (/${fp.healthyPattern.source}/ not found)`,
  };
}

/**
 * Result of an attempted quick restart. `diagnostics` is populated on
 * failure with information the LLM-driven repair stage can use to avoid
 * repeating the same mistake (exited container names, log tails, what
 * recovery strategies were already tried, etc.).
 */
export interface QuickRestartResult {
  ok: boolean;
  diagnostics?: string;
}

/**
 * Inspect compose containers and return any that aren't running, with
 * their last log tail. Used after a restart attempt to figure out *why*
 * the app didn't come back, so the LLM repair stage gets context.
 *
 * Framework-agnostic: just reports what compose tells us. Interpretation
 * (e.g. "this is a stale PID, run rm /app/tmp/pids/server.pid") is left
 * to the LLM stage, which is far better at pattern-matching across the
 * long tail of frameworks than any regex we'd write here.
 */
function captureExitedContainers(
  repoPath: string,
  composeFile: string,
): Array<{ service: string; status: string; logs: string }> {
  try {
    const psOut = execSync(
      `docker compose -f ${composeFile} ps -a --format json`,
      { cwd: repoPath, encoding: "utf-8", timeout: 15_000 },
    ).trim();
    if (!psOut) return [];

    // `docker compose ps --format json` emits one JSON object per line
    const lines = psOut.split("\n").filter((l) => l.trim().startsWith("{"));
    const exited: Array<{ service: string; status: string; logs: string }> = [];
    for (const line of lines) {
      try {
        const c = JSON.parse(line) as { Service?: string; State?: string; Status?: string };
        const state = (c.State ?? "").toLowerCase();
        if (state && state !== "running") {
          let logs = "";
          try {
            logs = execSync(
              `docker compose -f ${composeFile} logs --tail=50 --no-color ${c.Service}`,
              { cwd: repoPath, encoding: "utf-8", timeout: 15_000 },
            );
          } catch {
            // ignore log fetch failure
          }
          exited.push({
            service: c.Service ?? "<unknown>",
            status: c.Status ?? c.State ?? "unknown",
            logs: logs.slice(-4_000),
          });
        }
      } catch {
        // skip malformed line
      }
    }
    return exited;
  } catch {
    return [];
  }
}

/**
 * Wait for the app HTTP probe to come back, polling every 3s.
 */
async function waitForAppHealthy(
  port: number,
  healthCheckPath: string,
  waitMs: number,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < waitMs) {
    if (await checkAppHealth(port, healthCheckPath)) return true;
    await new Promise((r) => setTimeout(r, 3_000));
  }
  return false;
}

/**
 * Fast restart of the docker-compose target without rebuilding or invoking
 * any LLM. Used by the app-health monitor when the running app wedges.
 *
 * Tries two framework-agnostic strategies in order:
 *   1. `docker compose restart` — quickest; restarts the container process.
 *   2. `docker compose up -d --force-recreate` — recreates the container
 *      (fresh filesystem layer, fresh PID 1, preserves named volumes).
 *      Strictly stronger than restart for cases where in-container state
 *      got corrupted but the image and config are still fine.
 *
 * On success returns `{ ok: true }`. On failure returns `{ ok: false,
 * diagnostics }` with a structured summary of which strategies were
 * tried and what compose reports about the exited containers, so the
 * LLM-driven repair stage can adapt instead of repeating the same moves.
 */
export async function quickRestartCompose(
  repoPath: string,
  config: StartupConfig,
  waitMs = 90_000,
): Promise<QuickRestartResult> {
  if (!config.docker) return { ok: false, diagnostics: "Not a dockerized app" };

  // Resolve compose file: first try to extract from the startup command,
  // then fall back to scanning the repo root for common compose filenames.
  const composeFileMatch = config.command.match(/-f\s+(\S+)/);
  const cdMatch = config.command.match(/cd\s+(\S+)\s*&&/);
  const cwd = cdMatch ? `${repoPath}/${cdMatch[1]}` : repoPath;
  let composeFile = composeFileMatch?.[1] ?? undefined;
  if (!composeFile) {
    composeFile = findComposeFile(cwd) ?? findComposeFile(repoPath) ?? "docker-compose.yml";
  }
  const probePath = config.healthCheckPath ?? "/";

  // Strategy 1: plain restart
  console.log(`[AppHealth] quickRestartCompose: docker compose -f ${composeFile} restart (cwd=${cwd})`);
  const triedStrategies: string[] = [];
  try {
    execSync(`docker compose -f ${composeFile} restart`, {
      cwd, stdio: "pipe", timeout: 60_000,
    });
    triedStrategies.push("docker compose restart");
    if (await waitForAppHealthy(config.port, probePath, waitMs)) {
      console.log(`[AppHealth] App responsive again after restart`);
      return { ok: true };
    }
  } catch (err) {
    triedStrategies.push(`docker compose restart (failed: ${err instanceof Error ? err.message : String(err)})`);
  }

  // Strategy 2: force-recreate (generic stronger restart — same image, fresh container)
  console.log(`[AppHealth] Restart insufficient; trying force-recreate`);
  try {
    execSync(`docker compose -f ${composeFile} up -d --force-recreate`, {
      cwd, stdio: "pipe", timeout: 120_000,
    });
    triedStrategies.push("docker compose up -d --force-recreate");
    if (await waitForAppHealthy(config.port, probePath, waitMs)) {
      console.log(`[AppHealth] App responsive again after force-recreate`);
      return { ok: true };
    }
  } catch (err) {
    triedStrategies.push(`docker compose up -d --force-recreate (failed: ${err instanceof Error ? err.message : String(err)})`);
  }

  // Both strategies exhausted — gather diagnostics for the LLM stage
  const exited = captureExitedContainers(cwd, composeFile);
  const triedList = triedStrategies.map((s) => `  - ${s}`).join("\n");
  if (exited.length === 0) {
    return {
      ok: false,
      diagnostics: `Quick restart strategies did not bring the app back. Strategies tried:\n${triedList}\nAll containers report running but the HTTP probe at port ${config.port}${probePath} never succeeded. The app process inside the container is likely wedged but not crashing.`,
    };
  }
  const exitedSummary = exited
    .map((c) => `- service "${c.service}" (${c.status})\n  logs (tail):\n${c.logs.split("\n").map((l) => `    ${l}`).join("\n")}`)
    .join("\n");
  return {
    ok: false,
    diagnostics: `Quick restart strategies did not bring the app back. Strategies tried:\n${triedList}\nContainers in non-running state after these attempts:\n${exitedSummary}`,
  };
}

export function cleanupDocker(repoPath: string): void {
  try {
    // Tear down compose projects in the repo first (scoped to this project)
    execSync(
      "docker compose down --remove-orphans 2>/dev/null; docker compose -f compose.local.yml down --remove-orphans 2>/dev/null || true",
      { cwd: repoPath, stdio: "pipe", timeout: 30_000 },
    );

    // Find and stop containers started by compose in this directory
    // (docker compose labels them with the project directory name)
    const projectName = repoPath.split("/").pop() ?? "";
    if (projectName) {
      const projectContainers = execSync(
        `docker ps -aq --filter "label=com.docker.compose.project=${projectName}" 2>/dev/null || true`,
        { encoding: "utf-8", timeout: 10_000 },
      ).trim();
      if (projectContainers) {
        console.log("[Startup] Removing project Docker containers...");
        execSync(`docker rm -f ${projectContainers}`, {
          stdio: "pipe",
          timeout: 30_000,
        });
      }
    }
  } catch {
    // Docker may not be installed or no containers running — that's fine
  }
}

/**
 * Capture Docker container logs from the most recent compose run.
 * Writes FULL logs to .bright-container-logs.txt so the repair LLM can
 * read_file it. Returns a head+tail excerpt for inline error messages.
 */
export function captureDockerLogs(repoPath: string, tailLines = 80): string {
  const logs: string[] = [];
  const containerNames: string[] = [];
  try {
    // Get running and exited containers from compose
    const containers = execFileSync(
      "docker",
      ["compose", "ps", "-a", "--format", "{{.Name}}"],
      { cwd: repoPath, encoding: "utf-8", timeout: 10_000 },
    )
      .trim()
      .split("\n")
      .filter(Boolean);
    containerNames.push(...containers);
  } catch {
    // docker compose ps failed — try recently created containers
    try {
      const allContainers = execFileSync(
        "docker",
        ["ps", "-a", "--format", "{{.Names}}", "--last", "5"],
        { encoding: "utf-8", timeout: 10_000 },
      )
        .trim()
        .split("\n")
        .filter(Boolean);
      containerNames.push(...allContainers);
    } catch {
      /* ignore */
    }
  }

  for (const name of containerNames) {
    try {
      // Capture FULL logs (no --tail) for the file dump
      const containerLog = execFileSync(
        "docker",
        ["logs", name],
        { encoding: "utf-8", timeout: 15_000, maxBuffer: 10 * 1024 * 1024 },
      );
      if (containerLog.trim()) {
        logs.push(`=== ${name} ===\n${containerLog.trim()}`);
      }
    } catch {
      // Container may have been removed already
    }
  }

  if (logs.length === 0) return "No container logs available.";

  const fullLogs = logs.join("\n\n");

  // Write full logs to a file the repair LLM can read
  try {
    writeFileSync(`${repoPath}/.bright-container-logs.txt`, fullLogs, "utf-8");
  } catch { /* best effort */ }

  // Return head+tail excerpt for inline error context
  const lines = fullLogs.split("\n");
  if (lines.length <= tailLines) return fullLogs;

  const headCount = Math.floor(tailLines * 0.4);
  const tailCount = tailLines - headCount;
  const head = lines.slice(0, headCount).join("\n");
  const tail = lines.slice(-tailCount).join("\n");
  return `${head}\n\n... (${lines.length - tailLines} lines omitted — full logs in .bright-container-logs.txt) ...\n\n${tail}`;
}

/**
 * Gather a structured "bird's eye view" of the current Docker state.
 * This is injected directly into the infra-repair prompt so the LLM
 * starts with full situational awareness instead of spending turns
 * running docker ps / docker logs / docker inspect one at a time.
 */
function gatherDiagnosticSnapshot(repoPath: string): string {
  const sections: string[] = [];

  // 1. Container status overview
  try {
    const ps = execFileSync(
      "docker",
      ["ps", "-a", "--format", "table {{.Names}}\t{{.Status}}\t{{.Ports}}"],
      { encoding: "utf-8", timeout: 10_000 },
    ).trim();
    sections.push(`## Container Status\n\`\`\`\n${ps}\n\`\`\``);
  } catch { /* ignore */ }

  // 2. Docker volumes (stale volumes are a common cause of password/state issues)
  try {
    const volumes = execFileSync(
      "docker",
      ["volume", "ls", "--format", "table {{.Name}}\t{{.Driver}}"],
      { encoding: "utf-8", timeout: 10_000 },
    ).trim();
    sections.push(`## Docker Volumes\n\`\`\`\n${volumes}\n\`\`\``);
  } catch { /* ignore */ }

  // 3. Health check details for unhealthy containers
  try {
    const containers = execFileSync(
      "docker",
      ["ps", "-a", "--filter", "health=unhealthy", "--filter", "health=starting", "--format", "{{.Names}}"],
      { encoding: "utf-8", timeout: 10_000 },
    ).trim().split("\n").filter(Boolean);
    for (const name of containers.slice(0, 3)) {
      try {
        const health = execFileSync(
          "docker",
          ["inspect", "--format", "{{json .State.Health}}", name],
          { encoding: "utf-8", timeout: 10_000 },
        ).trim();
        try {
          const parsed = JSON.parse(health);
          const lastLogs = (parsed.Log || []).slice(-3).map((l: { ExitCode: number; Output: string }) =>
            `  exit=${l.ExitCode}: ${(l.Output || "").trim().slice(0, 200)}`
          ).join("\n");
          sections.push(`## Health Check: ${name} (${parsed.Status})\nLast checks:\n${lastLogs}`);
        } catch {
          sections.push(`## Health Check: ${name}\n${health.slice(0, 500)}`);
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  // 4. Key error lines from container logs (grep for common failure patterns)
  try {
    const logFile = `${repoPath}/.bright-container-logs.txt`;
    if (existsSync(logFile)) {
      const logContent = readFileSync(logFile, "utf-8");
      const errorPatterns = /error|failed|fatal|panic|exception|denied|refused|password.*match|login failed|permission|timeout|not found|cannot connect/i;
      const errorLines = logContent.split("\n")
        .filter(line => errorPatterns.test(line))
        .slice(0, 20)
        .map(line => line.trim().slice(0, 300));
      if (errorLines.length > 0) {
        sections.push(`## Key Error Lines from Container Logs\n\`\`\`\n${errorLines.join("\n")}\n\`\`\``);
      }
    }
  } catch { /* ignore */ }

  // 5. Resolved compose config (shows actual interpolated values)
  try {
    const composeConfig = execFileSync(
      "docker",
      ["compose", "config"],
      { cwd: repoPath, encoding: "utf-8", timeout: 10_000 },
    ).trim();
    if (composeConfig.length < 3000) {
      sections.push(`## Resolved Compose Config\n\`\`\`yaml\n${composeConfig}\n\`\`\``);
    } else {
      sections.push(`## Resolved Compose Config (truncated)\n\`\`\`yaml\n${composeConfig.slice(0, 3000)}\n...(truncated)\n\`\`\``);
    }
  } catch { /* ignore */ }

  if (sections.length === 0) return "";
  return `\n\n# DIAGNOSTIC SNAPSHOT (current Docker state)\n${sections.join("\n\n")}`;
}
