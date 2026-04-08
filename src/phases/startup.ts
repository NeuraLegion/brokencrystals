import type OpenAI from "openai";
import { spawn, execSync, execFileSync, type ChildProcess } from "child_process";
import { createInterface } from "readline";
import type { TechStack, StartupConfig } from "../types.js";
import { chatWithTools } from "../inference.js";
import { codebaseTools, createToolHandler } from "../tools.js";
import { sleep, formatTechStack, toErrorMessage } from "../utils.js";
import {
  identifyStartupPrompt,
  rebuildStartupPrompt,
  retryStartupPrompt,
} from "../prompts/identify-startup.js";

const MAX_STARTUP_ATTEMPTS = 5;

export interface StartupResult {
  process: ChildProcess;
  config: StartupConfig;
}

export async function startApplicationWithRetries(
  llm: OpenAI,
  repoPath: string,
  techStack: TechStack,
  previousStartup?: StartupConfig,
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
      config = await rebuildStartupConfig(llm, repoPath, stackStr, handleTool, previousStartup);
    } else if (attempt === 1) {
      config = await identifyStartupConfig(llm, repoPath, stackStr, handleTool);
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
      );
    }

    console.log(
      `[Startup] Attempt ${attempt}/${MAX_STARTUP_ATTEMPTS}: ${config.docker ? "Docker" : "native"} — ${config.command}`,
    );

    try {
      const proc = await startApplication(repoPath, config);
      console.log(`[Startup] Application started successfully on attempt ${attempt}`);
      return { process: proc, config };
    } catch (err) {
      const errorMsg = toErrorMessage(err);
      console.error(`[Startup] Attempt ${attempt} failed: ${errorMsg}`);
      attemptErrors.push({ config, error: errorMsg });

      // Clean up any Docker containers from failed attempts
      if (config.docker) {
        try {
          execSync("docker compose down 2>/dev/null || true", {
            cwd: repoPath,
            stdio: "ignore",
            timeout: 30_000,
          });
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
): Promise<StartupConfig> {
  const messages = identifyStartupPrompt(stackStr);
  const response = await chatWithTools(llm, messages, codebaseTools, handleTool);
  return parseStartupConfig(response);
}

async function rebuildStartupConfig(
  llm: OpenAI,
  repoPath: string,
  stackStr: string,
  handleTool: (name: string, args: Record<string, unknown>) => Promise<string>,
  previousConfig: StartupConfig,
): Promise<StartupConfig> {
  const messages = rebuildStartupPrompt(stackStr, JSON.stringify(previousConfig, null, 2));
  const response = await chatWithTools(llm, messages, codebaseTools, handleTool);
  return parseStartupConfig(response);
}

async function retryStartupConfig(
  llm: OpenAI,
  repoPath: string,
  stackStr: string,
  handleTool: (name: string, args: Record<string, unknown>) => Promise<string>,
  previousConfig: StartupConfig,
  errorOutput: string,
  attempt: number,
): Promise<StartupConfig> {
  const messages = retryStartupPrompt(
    stackStr,
    JSON.stringify(previousConfig, null, 2),
    errorOutput,
    attempt,
  );
  const response = await chatWithTools(llm, messages, codebaseTools, handleTool);
  return parseStartupConfig(response);
}

function parseStartupConfig(response: string): StartupConfig {
  try {
    const jsonStr = extractJson(response);
    const parsed = JSON.parse(jsonStr);
    return {
      command: parsed.command ?? "npm start",
      port: parsed.port ?? 3000,
      prerequisites: parsed.prerequisites ?? [],
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
      // Capture docker logs for debugging
      logDockerFailure(repoPath);
      throw err;
    }

    // Compose exited successfully — services should be healthy, give port a short check
    console.log("[Startup] Docker Compose services healthy, checking port...");
    await waitForPort(config.port, 30_000);
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
