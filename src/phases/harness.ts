import type OpenAI from "openai";
import { execSync, spawn, type ChildProcess } from "child_process";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createInterface } from "readline";
import type {
  TechStack,
  HarnessTarget,
  HarnessConfig,
  HarnessEndpoint,
  DiscoveredEndpoint,
} from "../types.js";
import { chatWithTools, type ToolHandler, type ModelSelector } from "../inference.js";
import { codebaseTools, createToolHandler } from "../tools.js";
import { extractJson, extractCodeBlock, formatTechStack, sleep, toErrorMessage, FETCH_TIMEOUT_QUICK, FETCH_TIMEOUT_DEFAULT } from "../utils.js";
import {
  identifyHarnessTargetsPrompt,
  generateHarnessPrompt,
  identifyInfraPrompt,
  harnessDockerfileRepairPrompt,
  standaloneHarnessDockerfilePrompt,
  harnessCodeRepairPrompt,
} from "../prompts/harness.js";
import {
  cleanupDocker,
  ensureDockerIgnore,
} from "./startup.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface HarnessResult {
  process: ChildProcess | undefined;
  config: HarnessConfig;
  endpoints: DiscoveredEndpoint[];
}

/**
 * Full function-harness pipeline:
 * 1. Start minimal infrastructure (DB, Redis)
 * 2. Identify critical functions via LLM
 * 3. Generate a lightweight HTTP harness
 * 4. Start the harness
 *
 * Returns endpoints that can be registered with Bright for scanning.
 */
export async function runFunctionHarness(
  llm: OpenAI,
  repoPath: string,
  techStack: TechStack,
  modelSelector: ModelSelector,
): Promise<HarnessResult> {
  const stackStr = formatTechStack(techStack);
  const handleTool = createToolHandler(repoPath);

  // Step 1: Analyze infrastructure needs and start data stores
  console.log("[Harness] Analyzing infrastructure requirements...");
  const infraInfo = await identifyInfra(llm, repoPath, stackStr, handleTool, modelSelector.current());

  console.log("[Harness] Starting minimal infrastructure...");
  await startMinimalInfra(repoPath, infraInfo);

  // Step 2: Identify critical functions
  console.log("[Harness] Identifying critical functions for harness scanning...");
  let targets = await identifyTargets(llm, repoPath, stackStr, handleTool, modelSelector.current());

  // Escalate only if the base model found nothing
  if (targets.length === 0 && modelSelector.escalate()) {
    console.log("[Harness] No targets found — retrying with stronger model...");
    targets = await identifyTargets(llm, repoPath, stackStr, handleTool, modelSelector.current());
    modelSelector.reset();
  }

  if (targets.length === 0) {
    throw new Error("No suitable functions found for harness-based scanning");
  }

  console.log(`[Harness] Identified ${targets.length} target function(s):`);
  for (const t of targets) {
    console.log(`[Harness]   ${t.className}.${t.name} — tier ${t.tier ?? "?"} — ${t.vulnTypes.join(", ")} — deps: ${t.deps.join(", ")}`);
  }

  // Drop tier 3 targets — harness mode is a fallback from full-app startup,
  // so targets requiring full framework boot would just repeat the same failure.
  const tier3Count = targets.filter((t) => (t.tier ?? 3) >= 3).length;
  if (tier3Count > 0) {
    console.log(`[Harness] Dropping ${tier3Count} tier-3 target(s) (full framework boot not available in harness mode)`);
    targets = targets.filter((t) => (t.tier ?? 3) < 3);
  }

  if (targets.length === 0) {
    throw new Error("No tier 1/2 targets found — all identified functions require full framework boot");
  }

  // Step 3 + 4: Generate harness, build & start — with tier fallback
  // Try all targets first. If that fails and we have tier 1 targets, retry with only tier 1.
  let proc: ChildProcess;
  let harnessConfig: HarnessConfig;
  let activeTargets = targets;
  let healthyPaths: Set<string> = new Set();

  for (const attempt of ["all", "tier1-only"] as const) {
    if (attempt === "tier1-only") {
      const tier1Only = targets.filter((t) => t.tier === 1);
      if (tier1Only.length === 0 || tier1Only.length === activeTargets.length) {
        // No tier 1 targets to fall back to, or we already tried with only tier 1
        throw new Error("Harness failed to build or start after all repair attempts");
      }
      console.log(`[Harness] Retrying with ${tier1Only.length} tier-1 targets only (no external deps)...`);
      activeTargets = tier1Only;
      modelSelector.reset();
    }

    console.log("[Harness] Generating harness server...");
    harnessConfig = await generateHarness(
      llm,
      repoPath,
      stackStr,
      activeTargets,
      infraInfo,
      handleTool,
      modelSelector.current(),
    );

    console.log("[Harness] Building and starting harness server...");
    let harnessResult: HarnessStartResult;
    try {
      harnessResult = await startHarness(
        repoPath,
        llm,
        stackStr,
        harnessConfig,
        infraInfo,
        handleTool,
        modelSelector,
        activeTargets,
      );
      proc = harnessResult.process;
      healthyPaths = harnessResult.healthyPaths;
      break; // Success
    } catch (err) {
      console.warn(`[Harness] Harness failed (${attempt}): ${toErrorMessage(err)}`);
      if (attempt === "tier1-only") {
        throw err; // No more fallbacks
      }
      // Fall through to tier1-only retry
    }
  }

  // Convert harness endpoints to DiscoveredEndpoint format for Bright
  // Only include endpoints that were healthy during probing
  const discoveredEndpoints = harnessConfig!.endpoints
    .filter((ep) => healthyPaths.has(ep.path))
    .map(
      (ep): DiscoveredEndpoint => ({
        method: ep.method,
        path: ep.path,
        filePath: ep.target.file,
        body: ep.sampleBody ?? null,
        contentType: ep.contentType,
        // For GET endpoints, expose params as query params so the scanner has injection points
        queryParams:
          ep.method === "GET" && ep.target.params.length > 0
            ? ep.target.params.map((p) => ({
                name: p.name,
                value: formatHarnessQuerySample(p.sample),
              }))
            : undefined,
      }),
    );

  if (discoveredEndpoints.length === 0) {
    throw new Error("No healthy harness endpoints — all targets failed to load or returned errors");
  }
  console.log(`[Harness] Registering ${discoveredEndpoints.length}/${harnessConfig!.endpoints.length} healthy endpoints`);

  return { process: proc!, config: harnessConfig!, endpoints: discoveredEndpoints };
}

function formatHarnessQuerySample(sample: unknown): string {
  if (sample === null || sample === undefined) {
    return "";
  }
  if (typeof sample === "object") {
    // Bright entrypoint templating treats JSON braces in query values as
    // template delimiters and can leave stray "}" characters in scan requests.
    // Harness routes generally default blank JSON params to {}, so keep the
    // injection point without registering a malformed baseline URL.
    return "";
  }
  return String(sample);
}

// ---------------------------------------------------------------------------
// Step 1: Infrastructure analysis
// ---------------------------------------------------------------------------

interface InfraInfo {
  composeFile: string | null;
  services: Array<{
    name: string;
    image: string;
    ports: string[];
    env: Record<string, string>;
    essential: boolean;
  }>;
  migrationCommand: string | null;
  envVars: Record<string, string>;
}

async function identifyInfra(
  llm: OpenAI,
  repoPath: string,
  stackStr: string,
  handleTool: ToolHandler,
  model: string,
): Promise<InfraInfo> {
  const messages = identifyInfraPrompt(stackStr);
  const response = await chatWithTools(llm, messages, codebaseTools, handleTool, model, 15);

  try {
    const parsed = JSON.parse(extractJson(response));
    const envVars: Record<string, string> = parsed.envVars ?? {};

    // Ensure DB connections use TCP (localhost) instead of Unix sockets.
    // When running containers with --network host, services are on localhost
    // but many frameworks default to Unix socket connections.
    const services: Array<{ name: string; image: string; ports: string[]; env: Record<string, string>; essential: boolean }> = parsed.services ?? [];
    const hasPostgres = services.some((s) => /postgres/i.test(s.name) || /postgres/i.test(s.image));
    const hasMysql = services.some((s) => /mysql|mariadb/i.test(s.name) || /mysql|mariadb/i.test(s.image));
    const hasRedis = services.some((s) => /redis/i.test(s.name) || /redis/i.test(s.image));

    if (hasPostgres) {
      // Force trust auth on standalone PG containers so no password is needed
      for (const svc of services) {
        if (/postgres/i.test(svc.name) || /postgres/i.test(svc.image)) {
          svc.env.POSTGRES_HOST_AUTH_METHOD = "trust";
          // Propagate PG password to harness env as fallback (e.g. compose-started PG)
          if (svc.env.POSTGRES_PASSWORD && !envVars.PGPASSWORD) {
            envVars.PGPASSWORD = svc.env.POSTGRES_PASSWORD;
          }
        }
      }
      // Common PG host env vars — only set if not already specified by the LLM
      for (const key of ["DB_HOST", "DATABASE_HOST", "PGHOST", "DISCOURSE_DB_HOST"]) {
        if (!envVars[key]) envVars[key] = "localhost";
      }
    }
    if (hasMysql) {
      for (const svc of services) {
        if (/mysql|mariadb/i.test(svc.name) || /mysql|mariadb/i.test(svc.image)) {
          svc.env.MYSQL_ALLOW_EMPTY_PASSWORD = "yes";
        }
      }
      for (const key of ["DB_HOST", "DATABASE_HOST", "MYSQL_HOST"]) {
        if (!envVars[key]) envVars[key] = "localhost";
      }
    }
    if (hasRedis) {
      for (const key of ["REDIS_HOST", "DISCOURSE_REDIS_HOST"]) {
        if (!envVars[key]) envVars[key] = "localhost";
      }
    }

    return {
      composeFile: parsed.composeFile ?? null,
      services,
      migrationCommand: parsed.migrationCommand ?? null,
      envVars,
    };
  } catch {
    console.warn("[Harness] Could not parse infra response, assuming no infra needed");
    return { composeFile: null, services: [], migrationCommand: null, envVars: {} };
  }
}

async function startMinimalInfra(repoPath: string, infra: InfraInfo): Promise<void> {
  if (infra.services.length === 0) {
    console.log("[Harness] No infrastructure services needed");
    return;
  }

  // Clean up any existing containers to free ports
  cleanupDocker(repoPath);

  const essentialServices = infra.services.filter((s) => s.essential);
  if (essentialServices.length === 0) {
    console.log("[Harness] No essential infrastructure services");
    return;
  }

  // If a compose file exists, start only the essential services from it
  if (infra.composeFile && existsSync(resolve(repoPath, infra.composeFile))) {
    const serviceNames = essentialServices.map((s) => s.name).join(" ");
    const cmd = `docker compose -f ${infra.composeFile} up -d ${serviceNames}`;
    console.log(`[Harness] Starting infra: ${cmd}`);
    try {
      execSync(cmd, {
        cwd: repoPath,
        stdio: "pipe",
        timeout: 120_000,
        env: { ...process.env, ...infra.envVars },
      });
    } catch (err) {
      console.warn(`[Harness] Compose infra start failed: ${toErrorMessage(err)}`);
      // Fall through to standalone docker run
      await startServicesStandalone(essentialServices);
    }
  } else {
    // No compose file — start services as standalone containers
    await startServicesStandalone(essentialServices);
  }

  // Wait for infra to be ready
  console.log("[Harness] Waiting for infrastructure to be ready...");
  await sleep(5_000);

  // Note: migrations are deferred until the app image is built
  // so they can run inside Docker (where the runtime is available)
}

// Well-known default images for common service names when the LLM returns null/empty
const DEFAULT_SERVICE_IMAGES: Record<string, { image: string; ports: string[] }> = {
  postgres: { image: "postgres:16", ports: ["5432:5432"] },
  postgresql: { image: "postgres:16", ports: ["5432:5432"] },
  db: { image: "postgres:16", ports: ["5432:5432"] },
  mysql: { image: "mysql:8", ports: ["3306:3306"] },
  mariadb: { image: "mariadb:11", ports: ["3306:3306"] },
  redis: { image: "redis:7-alpine", ports: ["6379:6379"] },
  mongo: { image: "mongo:7", ports: ["27017:27017"] },
  mongodb: { image: "mongo:7", ports: ["27017:27017"] },
  elasticsearch: { image: "elasticsearch:8.13.0", ports: ["9200:9200"] },
};

async function startServicesStandalone(
  services: InfraInfo["services"],
): Promise<void> {
  for (const svc of services) {
    // Resolve image — fall back to well-known defaults when the LLM returns null/empty
    let image = svc.image;
    let ports = svc.ports;
    if (!image || image === "null") {
      const defaults = DEFAULT_SERVICE_IMAGES[svc.name.toLowerCase()];
      if (defaults) {
        image = defaults.image;
        if (!ports || ports.length === 0) ports = defaults.ports;
        console.log(`[Harness] Using default image for ${svc.name}: ${image}`);
      } else {
        console.warn(`[Harness] Skipping ${svc.name} — no image specified and no known default`);
        continue;
      }
    }
    if (!ports || ports.length === 0) {
      console.warn(`[Harness] Skipping ${svc.name} — no port mapping`);
      continue;
    }

    const envFlags = Object.entries(svc.env)
      .map(([k, v]) => `-e ${k}=${v}`)
      .join(" ");
    const portFlags = ports.map((p) => `-p ${p}`).join(" ");
    const cmd = `docker run -d --name harness_${svc.name} ${portFlags} ${envFlags} ${image}`;
    console.log(`[Harness] Starting standalone: ${cmd}`);
    try {
      execSync(cmd, { stdio: "pipe", timeout: 60_000 });
    } catch (err) {
      console.warn(`[Harness] Failed to start ${svc.name}: ${toErrorMessage(err)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Step 2: Identify critical functions
// ---------------------------------------------------------------------------

async function identifyTargets(
  llm: OpenAI,
  repoPath: string,
  stackStr: string,
  handleTool: ToolHandler,
  model: string,
): Promise<HarnessTarget[]> {
  const messages = identifyHarnessTargetsPrompt(stackStr);
  const response = await chatWithTools(llm, messages, codebaseTools, handleTool, model, 30);

  try {
    const parsed = JSON.parse(extractJson(response));
    if (!Array.isArray(parsed)) {
      console.warn("[Harness] Expected array of targets, got:", typeof parsed);
      return [];
    }

    // Validate each target has required fields
    const valid = parsed.filter((t: Record<string, unknown>) => {
      if (!t.name || !t.file || !t.className || !t.params || !t.vulnTypes) {
        console.warn(`[Harness] Skipping invalid target: ${JSON.stringify(t).slice(0, 200)}`);
        return false;
      }
      // Verify the file exists
      if (!existsSync(resolve(repoPath, String(t.file)))) {
        console.warn(`[Harness] Skipping target with missing file: ${t.file}`);
        return false;
      }
      return true;
    }) as HarnessTarget[];

    // Auto-infer tier from deps when LLM omits it
    for (const t of valid) {
      if (t.tier === undefined) {
        const depSet = new Set(t.deps);
        if (depSet.size === 0 || (depSet.size === 1 && depSet.has("none"))) {
          t.tier = 1;
        } else {
          // Has deps (db, filesystem, http) but can be initialized standalone
          t.tier = 2;
        }
        console.log(`[Harness] Auto-inferred tier ${t.tier} for ${t.className}.${t.name} (deps: ${t.deps.join(", ")})`);
      }
    }

    return valid;
  } catch (err) {
    console.error(`[Harness] Failed to parse targets: ${toErrorMessage(err)}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Step 3: Generate harness
// ---------------------------------------------------------------------------

async function generateHarness(
  llm: OpenAI,
  repoPath: string,
  stackStr: string,
  targets: HarnessTarget[],
  infra: InfraInfo,
  handleTool: ToolHandler,
  model: string,
): Promise<HarnessConfig> {
  const infraDescription = infra.services.length > 0
    ? `Services running: ${infra.services.filter((s) => s.essential).map((s) => `${s.name} (${s.image})`).join(", ")}. Env vars: ${JSON.stringify(infra.envVars)}`
    : "No infrastructure services — all targets are stateless or use local file system only.";

  const messages = generateHarnessPrompt(stackStr, targets, infraDescription);
  const response = await chatWithTools(llm, messages, codebaseTools, handleTool, model, 20);

  // Extract code block
  const codeMatch = response.match(/```(\w+)\s*\n([\s\S]*?)```/);
  if (!codeMatch) {
    throw new Error("LLM did not return a code block for the harness");
  }

  const language = codeMatch[1];
  const harnessCode = codeMatch[2];

  // Extract start command and filename from LLM JSON metadata
  const jsonMatch = response.match(/```[\s\S]*?```\s*(\{[\s\S]*?\})/);
  let startCommand = "";
  let docker = false;
  let harnessFileName = "";
  if (jsonMatch) {
    try {
      const meta = JSON.parse(jsonMatch[1]);
      startCommand = meta.startCommand ?? "";
      docker = meta.docker ?? false;
      harnessFileName = meta.harnessFileName ?? "";
    } catch { /* use defaults */ }
  }

  // Derive filename from code block language tag if LLM didn't provide it
  if (!harnessFileName) {
    const extMap: Record<string, string> = {
      ruby: ".rb", javascript: ".js", typescript: ".ts",
      python: ".py", go: ".go", csharp: ".cs", java: ".java", php: ".php",
    };
    const ext = extMap[language] ?? "." + language;
    harnessFileName = `harness${ext}`;
  }
  const harnessPath = resolve(repoPath, harnessFileName);

  if (!startCommand) {
    // Last resort — infer from extension
    const cmdMap: Record<string, string> = {
      ".rb": `ruby ${harnessFileName}`, ".js": `node ${harnessFileName}`,
      ".ts": `npx tsx ${harnessFileName}`, ".py": `python ${harnessFileName}`,
      ".go": `go run ${harnessFileName}`,
    };
    const ext = harnessFileName.slice(harnessFileName.lastIndexOf("."));
    startCommand = cmdMap[ext] ?? `node ${harnessFileName}`;
  }

  // Write harness file
  writeFileSync(harnessPath, harnessCode, "utf-8");
  console.log(`[Harness] Wrote harness to ${harnessFileName} (${harnessCode.length} bytes)`);

  // Build endpoint list from targets
  const endpoints: HarnessEndpoint[] = targets.map((t) => {
    const pathSlug = `${t.className}-${t.name}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");

    const sampleBody =
      t.httpMethod === "GET"
        ? undefined
        : JSON.stringify(
            Object.fromEntries(t.params.map((p) => [p.name, p.sample])),
          );

    return {
      method: t.httpMethod,
      path: `/harness/${pathSlug}`,
      target: t,
      sampleBody,
      contentType: t.httpMethod === "GET" ? undefined : "application/json",
    };
  });

  return {
    harnessFile: harnessPath,
    startCommand,
    port: 3001,
    docker,
    endpoints,
  };
}

// ---------------------------------------------------------------------------
// Step 4: Build & start harness (reuses startup.ts Docker capabilities)
// ---------------------------------------------------------------------------

const HARNESS_IMAGE = "bright-harness-local";
const HARNESS_CONTAINER = "bright-harness-local";

interface HarnessStartResult {
  process: ChildProcess;
  /** Endpoint paths that returned 2xx during probing */
  healthyPaths: Set<string>;
}

async function startHarness(
  repoPath: string,
  llm: OpenAI,
  techStack: string,
  config: HarnessConfig,
  infraInfo: InfraInfo,
  handleTool: ToolHandler,
  modelSelector: ModelSelector,
  targets: HarnessTarget[],
): Promise<HarnessStartResult> {
  // All tier 3 targets have already been filtered out before reaching here.
  // Harness mode is a fallback — full framework boot is not attempted.
  const maxTier = Math.max(...targets.map((t) => t.tier ?? 2)) as 1 | 2;
  console.log(`[Harness] All targets are tier ≤${maxTier} — skipping full app build, using stock runtime image`);

  // Ensure .dockerignore excludes problematic dirs
  ensureDockerIgnore(repoPath);

  // Build harness layer — self-contained, no full app build needed.
  // LLM generates Dockerfile.harness, then a repair loop handles build/runtime failures.
  const harnessFileName = config.harnessFile.split("/").pop()!;
  let harnessCode = readFileSync(config.harnessFile, "utf-8");
  const harnessDockerfilePath = resolve(repoPath, "Dockerfile.harness");

  // LLM generates Dockerfile.harness — always self-contained (no base app image)
  console.log("[Harness] Generating Dockerfile.harness via LLM...");
  const genMessages = standaloneHarnessDockerfilePrompt(
    techStack, harnessCode, harnessFileName, config.startCommand, config.port,
    targets.map((t) => ({
      file: t.file,
      className: t.className,
      name: t.name,
      deps: t.deps,
      tier: t.tier,
      requireStatements: t.requireStatements,
    })),
  );
  const genResponse = await chatWithTools(
    llm, genMessages, codebaseTools, handleTool, modelSelector.current(), 10,
  );
  let harnessDockerfileContent = extractCodeBlock(genResponse);
  if (!harnessDockerfileContent) {
    // LLM didn't return a fenced code block — retry once with escalated model
    console.warn("[Harness] LLM did not return a Dockerfile block, retrying...");
    modelSelector.escalate();
    const retryResponse = await chatWithTools(
      llm, genMessages, codebaseTools, handleTool, modelSelector.current(), 10,
    );
    harnessDockerfileContent = extractCodeBlock(retryResponse);
    if (!harnessDockerfileContent) {
      throw new Error("LLM failed to generate Dockerfile.harness after retry");
    }
  }
  writeFileSync(harnessDockerfilePath, harnessDockerfileContent, "utf-8");
  console.log(`[Harness] Generated Dockerfile.harness (${harnessDockerfileContent.split("\n").length} lines)`);

  // Build + start with LLM repair loop
  const MAX_HARNESS_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_HARNESS_ATTEMPTS; attempt++) {
    // Build harness image
    console.log(`[Harness] Building harness image (attempt ${attempt + 1}/${MAX_HARNESS_ATTEMPTS})...`);
    try {
      execSync(`docker build -t ${HARNESS_IMAGE} -f Dockerfile.harness .`, {
        cwd: repoPath,
        stdio: "pipe",
        timeout: 120_000,
      });
    } catch (err) {
      const errMsg = extractExecError(err);
      console.warn(`[Harness] Harness image build failed (attempt ${attempt + 1})`);
      if (attempt < MAX_HARNESS_ATTEMPTS - 1) {
        await repairHarnessDockerfile(
          llm, repoPath, errMsg, harnessCode, harnessFileName, handleTool, modelSelector,
        );
      }
      continue;
    }

    // Clean up any previous harness container
    try {
      execSync(`docker rm -f ${HARNESS_CONTAINER} 2>/dev/null || true`, {
        stdio: "ignore", timeout: 10_000,
      });
    } catch { /* ignore */ }

    // Start harness container with --network host
    const envFlags: string[] = ["-e", `PORT=${config.port}`];
    for (const [k, v] of Object.entries(infraInfo.envVars)) {
      envFlags.push("-e", `${k}=${v}`);
    }
    const dockerArgs = [
      "run", "--rm", "--name", HARNESS_CONTAINER, "--network", "host",
      ...envFlags, HARNESS_IMAGE,
    ];
    console.log(`[Harness] Starting container: docker ${dockerArgs.join(" ")}`);
    const child = spawn("docker", dockerArgs, {
      cwd: repoPath,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    try {
      await waitForHarnessHealthy(child, config.port);

      // Probe all endpoints to check for runtime errors
      const probeResult = await probeEndpoints(config.port, config.endpoints);
      const { errors: probeErrors, healthyPaths } = probeResult;
      const totalEps = config.endpoints.length;

      if (probeErrors.length > 0) {
        console.warn(
          `[Harness] ${probeErrors.length}/${totalEps} endpoints returned errors after probe`,
        );
      }

      // If at least some endpoints work, proceed with those
      if (healthyPaths.size > 0) {
        console.log(
          `[Harness] ${healthyPaths.size}/${totalEps} endpoints healthy — proceeding`,
        );
        return { process: child, healthyPaths };
      }

      // All endpoints failing — try to repair harness code
      child.kill();
      if (attempt < MAX_HARNESS_ATTEMPTS - 1) {
        await repairHarnessCode(
          llm, repoPath, config, probeErrors, targets, handleTool, modelSelector,
        );
        // Re-read updated harness code for next Docker build
        harnessCode = readFileSync(config.harnessFile, "utf-8");
      }
      continue;
    } catch (err) {
      child.kill();
      const errStr = toErrorMessage(err);
      console.warn(`[Harness] Harness startup failed (attempt ${attempt + 1}): ${errStr}`);

      if (attempt < MAX_HARNESS_ATTEMPTS - 1) {
        // Determine if the error is in the harness code or the Dockerfile
        if (isHarnessCodeError(errStr)) {
          console.log("[Harness] Error is in harness code, not Dockerfile — repairing harness...");
          await repairHarnessCode(
            llm, repoPath, config,
            [{ method: "STARTUP", path: "/", status: 0, body: errStr }],
            targets, handleTool, modelSelector,
          );
          harnessCode = readFileSync(config.harnessFile, "utf-8");
        } else {
          await repairHarnessDockerfile(
            llm, repoPath, errStr, harnessCode, harnessFileName, handleTool, modelSelector,
          );
        }
      }
    }
  }

  throw new Error("Harness failed to build or start after all repair attempts");
}

// ---------------------------------------------------------------------------
// Harness Dockerfile helpers
// ---------------------------------------------------------------------------

/** Detect if a startup error is a harness code bug (not a Dockerfile issue). */
function isHarnessCodeError(error: string): boolean {
  const codeErrorPatterns = [
    /NameError.*undefined.*(?:variable|method)/i,
    /NoMethodError.*undefined method/i,
    /cannot infer basepath/i,
    /SyntaxError/i,
    /undefined method.*for main/i,
    /undefined local variable.*for main/i,
    /harness\.\w+:\d+:in/i, // stack trace pointing to harness file
  ];
  return codeErrorPatterns.some((p) => p.test(error));
}

function extractExecError(err: unknown): string {
  let errMsg = toErrorMessage(err);
  if (err && typeof err === "object") {
    const errObj = err as Record<string, unknown>;
    const stderr = errObj.stderr instanceof Buffer ? errObj.stderr.toString() : "";
    const stdout = errObj.stdout instanceof Buffer ? errObj.stdout.toString() : "";
    if (stderr || stdout) {
      errMsg = [stdout, stderr].filter(Boolean).join("\n").trim();
    }
  }
  return errMsg;
}

async function repairHarnessDockerfile(
  llm: OpenAI,
  repoPath: string,
  error: string,
  harnessCode: string,
  harnessFileName: string,
  handleTool: ToolHandler,
  modelSelector: ModelSelector,
): Promise<void> {
  const dockerfilePath = resolve(repoPath, "Dockerfile.harness");
  let currentDockerfile: string;
  try {
    currentDockerfile = readFileSync(dockerfilePath, "utf-8");
  } catch {
    return;
  }

  modelSelector.escalate();
  const truncatedError = error.length > 3000 ? error.slice(-3000) : error;
  const messages = harnessDockerfileRepairPrompt(
    truncatedError, currentDockerfile, harnessCode, harnessFileName,
  );

  try {
    console.log("[Harness] Asking LLM to repair Dockerfile.harness...");
    const response = await chatWithTools(
      llm, messages, codebaseTools, handleTool, modelSelector.current(), 20,
    );
    const fixed = extractCodeBlock(response);
    if (!fixed) {
      console.warn("[Harness] LLM did not return a valid Dockerfile.harness repair");
      return;
    }
    const changed = fixed !== currentDockerfile;
    writeFileSync(dockerfilePath, fixed, "utf-8");
    console.log(
      `[Harness] LLM repaired Dockerfile.harness (${fixed.split("\n").length} lines, ${changed ? "content changed" : "WARNING: no changes"})`,
    );
  } catch (err) {
    console.warn(`[Harness] Dockerfile.harness repair failed: ${toErrorMessage(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Endpoint probing — check each endpoint after harness starts
// ---------------------------------------------------------------------------

interface ProbeError {
  method: string;
  path: string;
  status: number;
  body: string;
}

interface ProbeResult {
  errors: ProbeError[];
  healthyPaths: Set<string>;
}

async function probeEndpoints(
  port: number,
  endpoints: HarnessEndpoint[],
): Promise<ProbeResult> {
  const errors: ProbeError[] = [];
  const healthyPaths = new Set<string>();
  const baseUrl = `http://localhost:${port}`;

  for (const ep of endpoints) {
    try {
      const sampleValue = (v: unknown): string =>
        typeof v === "string" ? v : JSON.stringify(v);

      const url =
        ep.method === "GET" && ep.target.params.length > 0
          ? `${baseUrl}${ep.path}?${new URLSearchParams(
              ep.target.params.map((p): [string, string] => [p.name, sampleValue(p.sample)]),
            ).toString()}`
          : `${baseUrl}${ep.path}`;

      const opts: RequestInit = {
        method: ep.method,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_DEFAULT),
      };
      if (ep.method !== "GET" && ep.sampleBody) {
        opts.headers = { "Content-Type": "application/json" };
        opts.body = ep.sampleBody;
      }

      const res = await fetch(url, opts);
      if (res.status >= 200 && res.status < 400) {
        console.log(`[Harness:probe] ${ep.method} ${ep.path} → ${res.status} OK`);
        healthyPaths.add(ep.path);
      } else {
        const body = await res.text().catch(() => "(could not read body)");
        const truncated = body.length > 500 ? body.slice(0, 500) + "..." : body;
        console.warn(`[Harness:probe] ${ep.method} ${ep.path} → ${res.status}: ${truncated}`);
        errors.push({ method: ep.method, path: ep.path, status: res.status, body: truncated });
      }
    } catch (err) {
      const msg = toErrorMessage(err);
      console.warn(`[Harness:probe] ${ep.method} ${ep.path} → error: ${msg}`);
      errors.push({ method: ep.method, path: ep.path, status: 0, body: msg });
    }
  }

  return { errors, healthyPaths };
}

// ---------------------------------------------------------------------------
// Harness code repair — fix the harness source after probe failures
// ---------------------------------------------------------------------------

async function repairHarnessCode(
  llm: OpenAI,
  repoPath: string,
  config: HarnessConfig,
  probeErrors: ProbeError[],
  targets: HarnessTarget[],
  handleTool: ToolHandler,
  modelSelector: ModelSelector,
): Promise<void> {
  const harnessCode = readFileSync(config.harnessFile, "utf-8");
  const harnessFileName = config.harnessFile.split("/").pop()!;

  modelSelector.escalate();
  const messages = harnessCodeRepairPrompt(harnessCode, harnessFileName, probeErrors, targets);

  try {
    console.log("[Harness] Asking LLM to repair harness code based on probe errors...");
    const response = await chatWithTools(
      llm, messages, codebaseTools, handleTool, modelSelector.current(), 20,
    );
    const codeMatch = response.match(/```(\w+)\s*\n([\s\S]*?)```/);
    if (!codeMatch) {
      console.warn("[Harness] LLM did not return a code block for harness repair");
      return;
    }
    const fixedCode = codeMatch[2];
    const changed = fixedCode !== harnessCode;
    writeFileSync(config.harnessFile, fixedCode, "utf-8");
    console.log(
      `[Harness] LLM repaired harness code (${fixedCode.split("\n").length} lines, ${changed ? "content changed" : "WARNING: no changes"})`,
    );
  } catch (err) {
    console.warn(`[Harness] Harness code repair failed: ${toErrorMessage(err)}`);
  }
}

async function waitForHarnessHealthy(
  child: ChildProcess,
  port: number,
): Promise<ChildProcess> {
  const outputLines: string[] = [];

  if (child.stdout) {
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      outputLines.push(line);
      console.log(`[Harness:out] ${line}`);
    });
  }
  if (child.stderr) {
    const rl = createInterface({ input: child.stderr });
    rl.on("line", (line) => {
      outputLines.push(`ERR: ${line}`);
      console.error(`[Harness:err] ${line}`);
    });
  }

  // Wait for port to be available
  const startTime = Date.now();
  const timeout = 120_000; // 2 min for Docker (image may need setup time)
  let ready = false;

  while (Date.now() - startTime < timeout) {
    // Check if process exited
    if (child.exitCode !== null) {
      throw new Error(
        `Harness process exited with code ${child.exitCode}. Output:\n${outputLines.slice(-20).join("\n")}`,
      );
    }
    try {
      const res = await fetch(`http://localhost:${port}/health`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_QUICK),
      });
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      // Not ready yet
    }
    await sleep(2_000);
  }

  if (!ready) {
    child.kill();
    throw new Error(
      `Harness did not become healthy within ${timeout / 1000}s. Output:\n${outputLines.slice(-30).join("\n")}`,
    );
  }

  console.log(`[Harness] Server healthy on port ${port}`);
  return child;
}

// ---------------------------------------------------------------------------
// Cleanup helper
// ---------------------------------------------------------------------------

export function cleanupHarnessInfra(repoPath: string): void {
  try {
    // Stop harness container specifically
    execSync(
      `docker rm -f ${HARNESS_CONTAINER} 2>/dev/null || true`,
      { stdio: "ignore", timeout: 15_000 },
    );
    // Clean up standalone infra containers (harness_postgres, harness_redis, etc.)
    execSync(
      "docker rm -f $(docker ps -aq --filter name=harness_) 2>/dev/null || true",
      { stdio: "ignore", timeout: 15_000 },
    );
  } catch { /* ignore */ }
  // Reuse shared cleanup for compose teardown
  cleanupDocker(repoPath);
}
