import type OpenAI from "openai";
import { spawn, execSync, execFileSync, type ChildProcess } from "child_process";
import { createInterface } from "readline";
import { existsSync, readFileSync, writeFileSync } from "fs";
import type { TechStack, StartupConfig } from "../types.js";
import { chatWithTools, type ModelSelector } from "../inference.js";
import { codebaseTools, createToolHandler } from "../tools.js";
import { sleep, formatTechStack, toErrorMessage } from "../utils.js";
import {
  identifyStartupPrompt,
  rebuildStartupPrompt,
  retryStartupPrompt,
} from "../prompts/identify-startup.js";
import { generateDockerfilePrompt } from "../prompts/generate-dockerfile.js";

const MAX_STARTUP_ATTEMPTS = 5;

/**
 * Check whether the repository has the files needed to build from source
 * (Dockerfile, docker-compose, package.json, etc.). If we can only run
 * from a pre-built remote image, fixes will never take effect.
 */
export function canBuildFromSource(repoPath: string): boolean {
  // Exact filenames at the repo root
  const buildIndicators = [
    "Dockerfile",
    "Dockerfile-dev",
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
  if (buildIndicators.some(f => existsSync(`${repoPath}/${f}`))) return true;

  // Glob patterns for build systems that use varying filenames (.sln, .csproj, .fsproj, etc.)
  try {
    const entries = execSync("ls -1", { cwd: repoPath, encoding: "utf-8", timeout: 5_000 }).split("\n");
    const globPatterns = [/\.sln$/i, /\.csproj$/i, /\.fsproj$/i, /\.vbproj$/i, /\.cabal$/i, /\.pro$/i];
    if (entries.some(e => globPatterns.some(p => p.test(e.trim())))) return true;
  } catch { /* ignore */ }

  return false;
}

export interface StartupResult {
  process: ChildProcess;
  config: StartupConfig;
}

export async function startApplicationWithRetries(
  llm: OpenAI,
  repoPath: string,
  techStack: TechStack,
  previousStartup?: StartupConfig,
  modelSelector?: ModelSelector,
): Promise<StartupResult> {
  // Clean up any running Docker containers to avoid port conflicts
  cleanupDocker(repoPath);

  const stackStr = formatTechStack(techStack);
  const handleTool = createToolHandler(repoPath);
  const attemptErrors: Array<{ config: StartupConfig; error: string }> = [];

  for (let attempt = 1; attempt <= MAX_STARTUP_ATTEMPTS; attempt++) {
    let config: StartupConfig;

    if (attempt === 1 && previousStartup) {
      // Source code changed — ask LLM to rebuild with the right strategy
      config = await rebuildStartupConfig(llm, repoPath, stackStr, handleTool, previousStartup, modelSelector?.current());
    } else if (attempt === 1) {
      config = await identifyStartupConfig(llm, repoPath, stackStr, handleTool, modelSelector?.current());
    } else {
      // Escalate model on retry if available
      modelSelector?.escalate();
      // If previous startup used a pre-built image and compose build-from-source
      // failed, try Dockerfile-only build before falling back to LLM
      const dockerfileOnly = (attempt === 2 && previousStartup?.docker && usesPrebuiltImage(previousStartup.command))
        ? buildDockerfileOnlyConfig(repoPath, previousStartup)
        : null;
      if (dockerfileOnly) {
        console.log("[Startup] Compose failed — trying Dockerfile-only build");
        config = dockerfileOnly;
      } else {
        const prev = attemptErrors[attemptErrors.length - 1];
        config = await retryStartupConfig(
          llm,
          repoPath,
          stackStr,
          handleTool,
          prev.config,
          prev.error,
          attempt,
          modelSelector?.current(),
        );
        // During rebuild (source changed), never fall back to a pre-built image —
        // it would discard all fixes applied to the source code.
        if (previousStartup && config.docker && usesPrebuiltImage(config.command)) {
          const fromSource = buildFromSourceConfig(repoPath, previousStartup)
            ?? buildDockerfileOnlyConfig(repoPath, previousStartup);
          if (fromSource) {
            console.log(`[Startup] LLM suggested pre-built image — overriding with source build`);
            config = fromSource;
          }
        }
      }
    }

    // Ensure a Dockerfile exists when Docker-based startup is requested.
    // If the project has source code but no Dockerfile, generate one so
    // Docker-based builds (and post-fix rebuilds) work.
    if (config.docker && !existsSync(`${repoPath}/Dockerfile`)) {
      console.log("[Startup] No Dockerfile found — generating one for this project");
      await generateDockerfile(llm, repoPath, stackStr, handleTool, modelSelector?.current());
      // Now that a Dockerfile exists, switch pre-built image configs to source builds
      if (usesPrebuiltImage(config.command)) {
        const fromSource = buildFromSourceConfig(repoPath, config)
          ?? buildDockerfileOnlyConfig(repoPath, config);
        if (fromSource) {
          console.log("[Startup] Switching to source build with generated Dockerfile");
          config = fromSource;
        }
      }
    }

    console.log(
      `[Startup] Attempt ${attempt}/${MAX_STARTUP_ATTEMPTS}: ${config.docker ? "Docker" : "native"} — ${config.command}`,
    );

    try {
      const proc = await startApplication(repoPath, config);
      console.log(`[Startup] Application started successfully on attempt ${attempt}`);
      modelSelector?.reset();
      return { process: proc, config };
    } catch (err) {
      const errorMsg = toErrorMessage(err);
      console.error(`[Startup] Attempt ${attempt} failed: ${errorMsg}`);
      attemptErrors.push({ config, error: errorMsg });

      // Clean up any Docker containers from failed attempts
      if (config.docker) {
        try {
          execSync(
            "docker compose down 2>/dev/null; docker rm -f $(docker ps -aq) 2>/dev/null || true",
            { cwd: repoPath, stdio: "ignore", timeout: 30_000 },
          );
        } catch { /* ignore */ }
      }
    }
  }

  const lastError = attemptErrors[attemptErrors.length - 1];
  const summary = attemptErrors
    .map((a, i) => `  Attempt ${i + 1} (${a.config.command}): ${a.error}`)
    .join("\n");

  throw new Error(
    `Failed to start application after ${MAX_STARTUP_ATTEMPTS} attempts:\n${summary}`,
  );
}

async function identifyStartupConfig(
  llm: OpenAI,
  repoPath: string,
  stackStr: string,
  handleTool: (name: string, args: Record<string, unknown>) => Promise<string>,
  model?: string,
): Promise<StartupConfig> {
  const messages = identifyStartupPrompt(stackStr);
  const response = await chatWithTools(llm, messages, codebaseTools, handleTool, model);
  return parseStartupConfig(response);
}

async function rebuildStartupConfig(
  llm: OpenAI,
  repoPath: string,
  stackStr: string,
  handleTool: (name: string, args: Record<string, unknown>) => Promise<string>,
  previousConfig: StartupConfig,
  model?: string,
): Promise<StartupConfig> {
  // If the previous command used a pre-built Docker image (not built from source),
  // we MUST switch to building from the repo's Dockerfile. Otherwise fixes applied
  // to source code won't take effect — the pre-built image has the old code.
  if (previousConfig.docker && usesPrebuiltImage(previousConfig.command)) {
    const fromSource = buildFromSourceConfig(repoPath, previousConfig);
    if (fromSource) {
      console.log(`[Startup] Previous startup used pre-built image — switching to build-from-source`);
      return fromSource;
    }
  }

  const messages = rebuildStartupPrompt(stackStr, JSON.stringify(previousConfig, null, 2));
  const response = await chatWithTools(llm, messages, codebaseTools, handleTool, model);
  return parseStartupConfig(response);
}

/**
 * Detect if a docker command uses a pre-built/remote image rather than
 * building from local source. Pre-built images contain the old code and
 * won't pick up source fixes.
 *
 * Examples of pre-built:
 *   docker run ... appsecco/dvna:sqlite
 *   docker run ... myrepo/myapp:latest
 *
 * Examples of source-built:
 *   docker compose -f docker-compose.yml up --build -d
 *   docker run ... app-local
 */
function usesPrebuiltImage(command: string): boolean {
  // "docker compose ... --build" rebuilds from source
  if (/docker\s+compose/.test(command) && command.includes("--build")) return false;

  // "docker run ... <image>" — check if image looks like a registry image (contains / or :)
  const runMatch = command.match(/docker\s+run\s+.*?\s+(\S+)\s*$/);
  if (runMatch) {
    const image = runMatch[1];
    // Registry images contain "/" (org/repo) or ":" (tag like :latest, :sqlite)
    // Local images built with "docker build -t name ." are usually just a simple name
    if (image.includes("/") || image.includes(":")) return true;
  }

  return false;
}

/**
 * Scan a compose file for env_file references and return the names
 * of any files that do not exist on disk.
 */
function findMissingEnvFiles(repoPath: string, composeFile: string): string[] {
  try {
    const content = readFileSync(`${repoPath}/${composeFile}`, "utf8");
    const missing: string[] = [];
    // Scalar form: env_file: vars.env
    for (const m of content.matchAll(/env_file:\s+(?!-)(\S+)/g)) {
      const file = m[1].replace(/["']/g, "");
      if (file && !existsSync(`${repoPath}/${file}`)) missing.push(file);
    }
    // List form: env_file:\n  - vars.env
    for (const m of content.matchAll(/env_file:\s*\n((?:\s+-\s+\S+\n?)+)/g)) {
      for (const item of m[1].matchAll(/^\s+-\s+(\S+)/gm)) {
        const file = item[1].replace(/["']/g, "");
        if (file && !existsSync(`${repoPath}/${file}`)) missing.push(file);
      }
    }
    return [...new Set(missing)];
  } catch {
    return [];
  }
}

/**
 * Create a missing env file referenced by a compose manifest.
 * Reads the compose content to discover environment-variable references
 * (${VAR} syntax) and database images, then writes sensible defaults
 * so that compose can start without manual configuration.
 */
function populateMissingEnvFile(
  repoPath: string,
  composeFile: string,
  envFile: string,
): void {
  const composePath = `${repoPath}/${composeFile}`;
  const envPath = `${repoPath}/${envFile}`;
  let content: string;
  try {
    content = readFileSync(composePath, "utf8");
  } catch {
    // If compose file can't be read, just create an empty file
    writeFileSync(envPath, "");
    return;
  }

  const lines: string[] = [];
  const added = new Set<string>();

  const addVar = (name: string, value: string) => {
    if (!added.has(name)) {
      lines.push(`${name}=${value}`);
      added.add(name);
    }
  };

  // Defaults for common database env vars
  const dbDefaults: Record<string, string> = {
    MYSQL_ROOT_PASSWORD: "bright_test",
    MYSQL_DATABASE: "app",
    MYSQL_USER: "app",
    MYSQL_PASSWORD: "bright_test",
    MYSQL_ALLOW_EMPTY_PASSWORD: "yes",
    POSTGRES_PASSWORD: "bright_test",
    POSTGRES_DB: "app",
    POSTGRES_USER: "postgres",
    MONGO_INITDB_ROOT_USERNAME: "root",
    MONGO_INITDB_ROOT_PASSWORD: "bright_test",
  };

  // Populate any ${VAR} references that match known DB vars
  for (const m of content.matchAll(/\$\{(\w+)\}/g)) {
    const name = m[1];
    if (dbDefaults[name]) addVar(name, dbDefaults[name]);
  }

  // Also populate directly-referenced env vars like MYSQL_ROOT_PASSWORD: ...
  for (const m of content.matchAll(/^\s+(MYSQL_\w+|POSTGRES_\w+|MONGO_\w+):/gm)) {
    const name = m[1];
    if (dbDefaults[name] && !added.has(name)) addVar(name, dbDefaults[name]);
  }

  // If compose has a mysql/postgres image but we haven't added any credentials, add them
  if (/image:\s*.*mysql/i.test(content) && !added.has("MYSQL_ROOT_PASSWORD")) {
    addVar("MYSQL_ROOT_PASSWORD", "bright_test");
    addVar("MYSQL_ALLOW_EMPTY_PASSWORD", "yes");
  }
  if (/image:\s*.*postgres/i.test(content) && !added.has("POSTGRES_PASSWORD")) {
    addVar("POSTGRES_PASSWORD", "bright_test");
  }

  console.log(`[Startup] Created ${envFile} with ${lines.length} default variable(s)`);
  writeFileSync(envPath, lines.length > 0 ? lines.join("\n") + "\n" : "");
}

/**
 * Build a startup config that builds the Docker image from source and runs it.
 * Returns null if no Dockerfile is found.
 */
function buildFromSourceConfig(
  repoPath: string,
  previousConfig: StartupConfig,
): StartupConfig | null {
  // Check for Dockerfile
  const hasDockerfile = existsSync(`${repoPath}/Dockerfile`);
  if (!hasDockerfile) return null;

  const port = previousConfig.port;
  const imageName = "bright-app-local";

  // Check for docker-compose.yml — if it exists, prefer compose with --build
  const composeFiles = [
    "docker-compose.yml", "compose.yml",
    "docker-compose.local.yml", "compose.local.yml",
    "docker-compose.dev.yml", "compose.dev.yml",
  ];
  for (const cf of composeFiles) {
    if (existsSync(`${repoPath}/${cf}`)) {
      const missingEnvFiles = findMissingEnvFiles(repoPath, cf);
      for (const envFile of missingEnvFiles) {
        populateMissingEnvFile(repoPath, cf, envFile);
      }
      return {
        command: `docker compose -f ${cf} up --build -d`,
        port,
        prerequisites: [],
        envVars: previousConfig.envVars,
        docker: true,
      };
    }
  }

  // Fall back to docker build + docker run
  return {
    command: `docker run --name ${imageName} -p ${port}:${port} -d ${imageName}`,
    port,
    prerequisites: [`docker build -t ${imageName} .`],
    envVars: previousConfig.envVars,
    docker: true,
  };
}

/**
 * Build directly from Dockerfile, skipping compose files.
 * Used as fallback when compose build-from-source fails.
 */
function buildDockerfileOnlyConfig(
  repoPath: string,
  previousConfig: StartupConfig,
): StartupConfig | null {
  if (!existsSync(`${repoPath}/Dockerfile`)) return null;
  const port = previousConfig.port;
  const imageName = "bright-app-local";
  return {
    command: `docker run --name ${imageName} -p ${port}:${port} -d ${imageName}`,
    port,
    prerequisites: [`docker build -t ${imageName} .`],
    envVars: previousConfig.envVars ?? {},
    docker: true,
  };
}

/**
 * Generate a Dockerfile using the LLM when the project needs Docker-based
 * startup but no Dockerfile exists.  The LLM inspects the project's config
 * and source files via codebase tools to produce an appropriate Dockerfile.
 */
async function generateDockerfile(
  llm: OpenAI,
  repoPath: string,
  stackStr: string,
  handleTool: (name: string, args: Record<string, unknown>) => Promise<string>,
  model?: string,
): Promise<void> {
  const messages = generateDockerfilePrompt(stackStr);
  const response = await chatWithTools(llm, messages, codebaseTools, handleTool, model);

  const content = extractCodeBlock(response);
  if (!content) {
    throw new Error("Failed to generate a valid Dockerfile — LLM did not return a code block");
  }

  writeFileSync(`${repoPath}/Dockerfile`, content);
  console.log(`[Startup] Generated Dockerfile (${content.split("\n").length} lines)`);
}

function extractCodeBlock(text: string): string | null {
  const match = text.match(/```(?:dockerfile|docker|Dockerfile)?\s*\n([\s\S]*?)```/i);
  if (match) return match[1].trimEnd() + "\n";

  // Fallback: extract lines that look like Dockerfile instructions
  const lines = text.split("\n");
  const dockerLines = lines.filter(l =>
    /^(FROM|RUN|COPY|ADD|WORKDIR|EXPOSE|CMD|ENTRYPOINT|ENV|ARG|LABEL|VOLUME|USER|HEALTHCHECK|SHELL|STOPSIGNAL|ONBUILD)\s/i.test(l.trim()) ||
    l.trim() === "" ||
    l.trim().startsWith("#"),
  );
  if (dockerLines.length >= 3) return dockerLines.join("\n") + "\n";

  return null;
}

async function retryStartupConfig(
  llm: OpenAI,
  repoPath: string,
  stackStr: string,
  handleTool: (name: string, args: Record<string, unknown>) => Promise<string>,
  previousConfig: StartupConfig,
  errorOutput: string,
  attempt: number,
  model?: string,
): Promise<StartupConfig> {
  const messages = retryStartupPrompt(
    stackStr,
    JSON.stringify(previousConfig, null, 2),
    errorOutput,
    attempt,
  );
  const response = await chatWithTools(llm, messages, codebaseTools, handleTool, model);
  return parseStartupConfig(response);
}

function parseStartupConfig(response: string): StartupConfig {
  try {
    const jsonStr = extractJson(response);
    const parsed = JSON.parse(jsonStr);
    // Filter out natural language "prerequisites" that aren't real commands
    const prerequisites = (parsed.prerequisites ?? []).filter(
      (cmd: unknown) => typeof cmd === "string" && cmd.length > 0 && looksLikeCommand(cmd),
    );
    return {
      command: parsed.command ?? "npm start",
      port: parsed.port ?? 3000,
      prerequisites,
      envVars: parsed.envVars ?? {},
      docker: parsed.docker ?? false,
    };
  } catch {
    return {
      command: "npm start",
      port: 3000,
      prerequisites: ["npm install"],
      envVars: { NODE_ENV: "development" },
      docker: false,
    };
  }
}

/**
 * Heuristic: a real shell command starts with a known CLI tool or path,
 * not an English sentence.
 */
function looksLikeCommand(s: string): boolean {
  const trimmed = s.trim();
  // Common command prefixes
  if (/^(npm|npx|yarn|pnpm|docker|make|pip|python|go|gradle|mvn|java|cargo|gem|bundle|cp|mv|mkdir|cat|echo|sh|bash|chmod|curl|wget|git|apt|brew|sed|awk|tee|touch|ln|export|cd|source|\.|\/)/.test(trimmed)) {
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

async function startApplication(
  repoPath: string,
  config: StartupConfig,
): Promise<ChildProcess> {
  // Run prerequisites
  for (const cmd of config.prerequisites) {
    console.log(`[Startup] Running prerequisite: ${cmd}`);
    execSync(cmd, {
      cwd: repoPath,
      stdio: "pipe",
      timeout: 300_000,
      env: { ...process.env, ...config.envVars },
    });
  }

  // Build environment
  const env = { ...process.env, ...config.envVars };

  // For docker compose commands, add --wait to wait for healthchecks
  let command = config.command;
  if (config.docker && /docker\s+compose/.test(command) && command.includes("-d") && !command.includes("--wait")) {
    command = command.replace("-d", "-d --wait");
  }

  // Parse command into parts
  const parts = command.split(/\s+/);
  const bin = parts[0];
  const args = parts.slice(1);

  console.log(`[Startup] Starting application: ${command} (port ${config.port})`);

  const child = spawn(bin, args, {
    cwd: repoPath,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  // Capture output for error reporting
  const outputLines: string[] = [];

  if (child.stdout) {
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      outputLines.push(line);
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
        reject(
          new Error(
            `Process exited with code ${code}. Output:\n${outputLines.slice(-30).join("\n")}`,
          ),
        );
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
        else reject(new Error(`docker compose exited with code ${code}. Output:\n${outputLines.slice(-30).join("\n")}`));
      });
    });

    try {
      await Promise.race([composeExitPromise, earlyExitPromise]);
    } catch (err) {
      // --wait fails if ANY container is unhealthy (e.g. watchtower, sidecars).
      // The app container itself may be fine — fall back to port check.
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("unhealthy") || errMsg.includes("exited with code")) {
        console.warn(`[Startup] docker compose --wait failed (${errMsg.slice(0, 200)}), falling back to port check...`);
        logDockerFailure(repoPath);
        try {
          await waitForPort(config.port, 60_000);
          console.log(`[Startup] Port ${config.port} is reachable despite --wait failure`);
          return child;
        } catch {
          throw new Error(`docker compose --wait failed and port ${config.port} is not reachable. Original error: ${errMsg.slice(0, 300)}`);
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
    await waitForPort(config.port, 120_000);
  } else {
    // Non-docker or docker without --wait
    const portTimeoutMs = config.docker ? 180_000 : 90_000;
    try {
      await Promise.race([
        waitForPort(config.port, portTimeoutMs),
        earlyExitPromise,
      ]);
    } catch (err) {
      if (config.docker) logDockerFailure(repoPath);
      if (child.exitCode === null) {
        child.kill("SIGTERM");
      }
      throw err;
    }
  }

  return child;
}

function logDockerFailure(repoPath: string): void {
  try {
    const ps = execSync("docker compose ps --format '{{.Name}} {{.Status}}' 2>/dev/null || true", {
      cwd: repoPath,
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
    if (ps) console.log(`[Startup] Docker container status:\n${ps}`);

    const logs = execSync("docker compose logs --tail=40 2>/dev/null || true", {
      cwd: repoPath,
      encoding: "utf-8",
      timeout: 15_000,
    }).trim();
    if (logs) console.log(`[Startup] Docker logs (last 40 lines):\n${logs.slice(-3000)}`);
  } catch { /* ignore */ }
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  const interval = 2_000;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${port}/`, {
        method: "HEAD",
        signal: AbortSignal.timeout(3_000),
      });
      if (response) return;
    } catch {
      // Connection refused — server not ready yet
    }
    await sleep(interval);
  }

  throw new Error(
    `Application did not start on port ${port} within ${timeoutMs / 1000}s`,
  );
}

/**
 * Quick, non-throwing health check: returns true if the app responds on
 * the given port within a short timeout.
 */
export async function checkAppHealth(port: number): Promise<boolean> {
  try {
    await fetch(`http://localhost:${port}/`, {
      method: "HEAD",
      signal: AbortSignal.timeout(5_000),
    });
    return true;
  } catch {
    return false;
  }
}

function extractJson(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  const jsonMatch = text.match(/(\{[\s\S]*\})/);
  if (jsonMatch) return jsonMatch[1];

  return text;
}

function cleanupDocker(repoPath: string): void {
  try {
    // Stop all running containers to free ports
    const running = execSync("docker ps -q", {
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();

    if (running) {
      console.log("[Startup] Stopping all running Docker containers...");
      execSync("docker stop $(docker ps -q)", {
        stdio: "pipe",
        timeout: 60_000,
      });
    }

    // Remove all stopped containers so `docker run --name X` won't conflict
    const stopped = execSync("docker ps -aq", {
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();

    if (stopped) {
      console.log("[Startup] Removing stopped Docker containers...");
      execSync("docker rm -f $(docker ps -aq)", {
        stdio: "pipe",
        timeout: 30_000,
      });
    }

    // Also tear down any compose projects in the repo
    execSync(
      "docker compose down 2>/dev/null; docker compose -f compose.local.yml down 2>/dev/null || true",
      { cwd: repoPath, stdio: "pipe", timeout: 30_000 },
    );
  } catch {
    // Docker may not be installed or no containers running — that's fine
  }
}

/**
 * Capture Docker container logs from the most recent compose run.
 * Returns the last N lines from all containers to help diagnose startup failures.
 */
export function captureDockerLogs(repoPath: string, tailLines = 80): string {
  const logs: string[] = [];
  try {
    // Get running and exited containers from compose
    const containers = execFileSync(
      "docker", ["compose", "ps", "-a", "--format", "{{.Name}}"],
      { cwd: repoPath, encoding: "utf-8", timeout: 10_000 },
    ).trim().split("\n").filter(Boolean);

    for (const name of containers) {
      try {
        const containerLog = execFileSync(
          "docker", ["logs", "--tail", String(tailLines), name],
          { encoding: "utf-8", timeout: 10_000 },
        );
        if (containerLog.trim()) {
          logs.push(`=== ${name} ===\n${containerLog.trim()}`);
        }
      } catch {
        // Container may have been removed already
      }
    }
  } catch {
    // docker compose ps failed — try docker logs for node-related containers
    try {
      const allContainers = execFileSync(
        "docker", ["ps", "-a", "--format", "{{.Names}}", "--filter", "name=nodejs"],
        { encoding: "utf-8", timeout: 10_000 },
      ).trim().split("\n").filter(Boolean);

      for (const name of allContainers) {
        try {
          const containerLog = execFileSync(
            "docker", ["logs", "--tail", String(tailLines), name],
            { encoding: "utf-8", timeout: 10_000 },
          );
          if (containerLog.trim()) {
            logs.push(`=== ${name} ===\n${containerLog.trim()}`);
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }
  return logs.join("\n\n") || "No container logs available.";
}
