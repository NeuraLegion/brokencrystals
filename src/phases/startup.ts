import type OpenAI from "openai";
import {
  spawn,
  execSync,
  execFileSync,
  type ChildProcess,
} from "child_process";
import { createInterface } from "readline";
import { existsSync, readFileSync, writeFileSync } from "fs";
import type { TechStack, StartupConfig } from "../types.js";
import { chatWithTools, type ModelSelector } from "../inference.js";
import {
  codebaseTools,
  createToolHandler,
  dockerfileTools,
  createDockerfileToolHandler,
  validateDockerfileImages,
  infraTools,
  createInfraToolHandler,
} from "../tools.js";
import { sleep, formatTechStack, toErrorMessage } from "../utils.js";
import {
  identifyStartupPrompt,
  rebuildStartupPrompt,
  retryStartupPrompt,
} from "../prompts/identify-startup.js";
import { generateDockerfilePrompt } from "../prompts/generate-dockerfile.js";

const MAX_STARTUP_ATTEMPTS = 5;

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
      config = await rebuildStartupConfig(
        llm,
        repoPath,
        stackStr,
        handleTool,
        previousStartup,
        modelSelector?.current(),
      );
    } else if (attempt === 1) {
      config = await identifyStartupConfig(
        llm,
        repoPath,
        stackStr,
        handleTool,
        modelSelector?.current(),
      );
    } else {
      // Escalate model on retry if available
      modelSelector?.escalate();
      // If previous startup used a pre-built image and compose build-from-source
      // failed, try Dockerfile-only build before falling back to LLM
      const dockerfileOnly =
        attempt === 2 &&
        previousStartup?.docker &&
        usesPrebuiltImage(previousStartup.command)
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
        if (
          previousStartup &&
          config.docker &&
          usesPrebuiltImage(config.command)
        ) {
          const fromSource =
            buildFromSourceConfig(repoPath, previousStartup) ??
            buildDockerfileOnlyConfig(repoPath, previousStartup);
          if (fromSource) {
            console.log(
              `[Startup] LLM suggested pre-built image — overriding with source build`,
            );
            config = fromSource;
          }
        }
      }
    }

    // --- Pre-validation: reject known-bad configs before wasting an attempt ---
    config = sanitizeStartupConfig(repoPath, config);

    // Ensure a Dockerfile exists when Docker-based startup is requested.
    // If the project has source code but no Dockerfile, generate one so
    // Docker-based builds (and post-fix rebuilds) work.
    if (config.docker && !existsSync(`${repoPath}/Dockerfile`)) {
      console.log(
        "[Startup] No Dockerfile found — generating one for this project",
      );
      await generateDockerfile(
        llm,
        repoPath,
        stackStr,
        handleTool,
        modelSelector?.current(),
      );
      // Now that a Dockerfile exists, switch pre-built image configs to source builds
      if (usesPrebuiltImage(config.command)) {
        const fromSource =
          buildFromSourceConfig(repoPath, config) ??
          buildDockerfileOnlyConfig(repoPath, config);
        if (fromSource) {
          console.log(
            "[Startup] Switching to source build with generated Dockerfile",
          );
          config = fromSource;
        }
      }
    }

    console.log(
      `[Startup] Attempt ${attempt}/${MAX_STARTUP_ATTEMPTS}: ${config.docker ? "Docker" : "native"} — ${config.command}`,
    );

    try {
      const proc = await startApplication(repoPath, config);
      console.log(
        `[Startup] Application started successfully on attempt ${attempt}`,
      );
      modelSelector?.reset();
      return { process: proc, config };
    } catch (err) {
      const errorMsg = toErrorMessage(err);
      console.error(`[Startup] Attempt ${attempt} failed: ${errorMsg}`);
      attemptErrors.push({ config, error: errorMsg });

      // Detect source code compilation errors that Dockerfile repair can't fix
      const previousErrorMsgs = attemptErrors.slice(0, -1).map((a) => a.error);
      if (isSourceCodeError(errorMsg, previousErrorMsgs)) {
        console.error(
          "[Startup] Build failed due to source code compilation errors on consecutive attempts — this is not a Dockerfile issue. Aborting retries.",
        );
        break;
      }

      // LLM-based repair when startup fails
      // Skip on the final attempt — repairs would never be tested
      if (attempt < MAX_STARTUP_ATTEMPTS) {
        const isDockerBuildError = config.docker &&
          existsSync(`${repoPath}/Dockerfile`) &&
          /failed to build|failed to solve|ERROR:.*process.*did not complete/i.test(errorMsg);

        if (isDockerBuildError) {
          // Dockerfile build failure — let LLM fix the Dockerfile
          await repairDockerBuild(
            llm,
            repoPath,
            errorMsg,
            handleTool,
            modelSelector?.current(),
          );
        } else {
          // Infrastructure failure (TTY flags, missing DB, compose issues, permissions, etc.)
          // Give the LLM write_file + run_command tools to fix the environment
          await repairInfrastructure(
            llm,
            repoPath,
            config,
            errorMsg,
            modelSelector?.current(),
          );
        }
      }

      // Clean up any Docker containers from failed attempts
      if (config.docker) {
        try {
          execSync(
            "docker compose down 2>/dev/null; docker rm -f $(docker ps -aq) 2>/dev/null || true",
            { cwd: repoPath, stdio: "ignore", timeout: 30_000 },
          );
        } catch {
          /* ignore */
        }
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
  const response = await chatWithTools(
    llm,
    messages,
    codebaseTools,
    handleTool,
    model,
  );
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
      console.log(
        `[Startup] Previous startup used pre-built image — switching to build-from-source`,
      );
      return fromSource;
    }
  }

  const messages = rebuildStartupPrompt(
    stackStr,
    JSON.stringify(previousConfig, null, 2),
  );
  const response = await chatWithTools(
    llm,
    messages,
    codebaseTools,
    handleTool,
    model,
  );
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
  if (/docker\s+compose/.test(command) && command.includes("--build"))
    return false;

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
 * Check if a compose file uses pre-built images instead of building from source.
 * Returns true if ANY service has `image:` with a registry reference but no `build:`.
 * We must build from source so that vulnerability fixes are included.
 */
function composeUsesPrebuiltImages(repoPath: string, composeFile: string): boolean {
  let content: string;
  try {
    content = readFileSync(`${repoPath}/${composeFile}`, "utf-8");
  } catch {
    return false;
  }

  // Simple YAML parsing: look for services that have `image:` but no `build:`
  // Split into service blocks by looking for top-level indentation patterns
  const imageRe = /^\s+image:\s*(\S+)/gm;
  const buildRe = /^\s+build:/gm;

  const hasRegistryImage = (() => {
    let m;
    while ((m = imageRe.exec(content)) !== null) {
      const img = m[1].replace(/["']/g, "");
      // Registry images contain "/" (org/repo) or explicit tags
      if (img.includes("/")) return true;
    }
    return false;
  })();

  // If no registry images found, compose is fine
  if (!hasRegistryImage) return false;

  // If there's at least one `build:` directive, the app service might build from source
  // But if no build directive at all, it's definitely using pre-built images
  return !buildRe.test(content);
}

/**
 * Patch a docker-compose file to build from the repo Dockerfile instead of
 * pulling a pre-built registry image. For app services with `image: org/repo:tag`,
 * replace the `image:` line with `build: .` so the local source code is used.
 * Database / infra images (mongo, postgres, redis, mysql, etc.) are left alone.
 */
function patchComposeForSourceBuild(repoPath: string, composeFile: string): void {
  const filePath = `${repoPath}/${composeFile}`;
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return;
  }

  // Infrastructure images we should NOT replace
  const infraPatterns =
    /\b(mongo|postgres|mysql|mariadb|redis|rabbitmq|memcached|elasticsearch|minio|nats|kafka|zookeeper|consul|vault|nginx|traefik|caddy|haproxy)\b/i;

  const patched = content.replace(
    /^(\s+)image:\s*(\S+)\s*$/gm,
    (match, indent: string, image: string) => {
      const cleanImage = image.replace(/["']/g, "");
      // Only patch registry images (contain "/") that aren't infra
      if (cleanImage.includes("/") && !infraPatterns.test(cleanImage)) {
        return `${indent}build: .`;
      }
      return match;
    },
  );

  if (patched !== content) {
    writeFileSync(filePath, patched);
    console.log(
      `[Startup] Replaced pre-built image in ${composeFile} with build: .`,
    );
  }
}

/**
 * Check that all `build:` context directories referenced in a compose file
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
async function repairDockerBuild(
  llm: OpenAI,
  repoPath: string,
  buildError: string,
  handleTool: (name: string, args: Record<string, unknown>) => Promise<string>,
  model?: string,
): Promise<void> {
  const dockerfilePath = `${repoPath}/Dockerfile`;
  let currentDockerfile: string;
  try {
    currentDockerfile = readFileSync(dockerfilePath, "utf-8");
  } catch {
    return;
  }

  // Truncate error to avoid blowing up the context
  const truncatedError = buildError.length > 3000
    ? buildError.slice(-3000)
    : buildError;

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    {
      role: "system",
      content: `You are a Docker expert. A Docker build just failed. Your job is to fix the Dockerfile.

You have tools to read any file in the repository. Use them to understand what the project needs (package.json, .csproj, go.mod, requirements.txt, build configs, etc.).

IMPORTANT: You have a verify_docker_image tool. ALWAYS call it to verify that any base image:tag you use in FROM lines exists on Docker Hub. If an image does not exist, try alternative tags until you find one that does.

Common issues and fixes:
- "npm/node: not found" in .NET builds → add RUN apt-get install nodejs npm before dotnet publish
- corepack signature errors → add ENV COREPACK_INTEGRITY_KEYS=0 and RUN npm install -g corepack@latest
- "git: not found" → add RUN apt-get update && apt-get install -y --no-install-recommends git in the stage that needs it
- Missing system dependencies → add apt-get install for the needed packages
- Wrong base image version → verify the correct tag with verify_docker_image, then switch
- Build context / COPY failures → fix paths or remove COPY lines for files that don't exist
- "Not found: type X" / compilation errors after COPY → the source code is incomplete. Replace individual COPY lines with "COPY . ." to ensure all source directories are included
- OutOfMemoryError during compilation → add ENV SBT_OPTS="-J-Xmx4g -J-XX:+UseG1GC" (for sbt) or ENV MAVEN_OPTS="-Xmx4g" (for Maven) or ENV GRADLE_OPTS="-Xmx4g" (for Gradle) BEFORE the build command
- Container crashes with "FileNotFoundException" for config files → check conf/ for available config files, use prod-mode flags (e.g. -Dconfig.resource=application.conf -Dlogger.resource=logback.xml) in CMD
- .NET AppHost/Aspire orchestrator projects cannot be published standalone → find a real web API project (Catalog.API, WebApp, etc.) and publish that instead
- dotnet publish succeeds but COPY --from=build fails with "not found" → the publish output path is wrong. List the build stage output to find where files actually went
- Permission issues → add appropriate RUN chmod/chown
- "tsc" exits with non-zero even when "--noEmitOnError false" is set (it still reports type errors) → append "|| true" to the tsc RUN command so the Docker build continues despite type warnings
- "npm ci" fails with "package.json and package-lock.json are in sync" / "Missing: <pkg> from lock file" → the runtime stage is using a built sub-project's package.json that doesn't match the root lockfile. Replace "npm ci" with "npm install" in that stage (or copy the sub-project's own lock file if it exists)
- "npm ci" postinstall fails with "Failed to process project graph" or monorepo tooling errors (nx, lerna, turbo, patch-package) → use "npm ci --ignore-scripts" to skip postinstall hooks, then run only the specific scripts needed (e.g. "RUN npx patch-package" separately). The full monorepo graph is NOT needed inside Docker when building a single service.

Return ONLY the complete fixed Dockerfile inside a single fenced code block. No explanation outside the code block.`,
    },
    {
      role: "user",
      content: `The Docker build failed with this error:

\`\`\`
${truncatedError}
\`\`\`

Current Dockerfile:
\`\`\`dockerfile
${currentDockerfile}
\`\`\`

Use the tools to inspect relevant project files, then return a COMPLETE fixed Dockerfile.`,
    },
  ];

  try {
    console.log("[Startup] Asking LLM to repair Dockerfile...");
    const dockerHandler = createDockerfileToolHandler(repoPath);
    const response = await chatWithTools(
      llm,
      messages,
      dockerfileTools,
      dockerHandler,
      model,
      12,
    );

    const fixedDockerfile = extractCodeBlock(response);
    if (!fixedDockerfile) {
      console.warn("[Startup] LLM did not return a valid Dockerfile repair");
      return;
    }

    // Sanity check: must contain FROM and at least one RUN/CMD
    if (!fixedDockerfile.includes("FROM ") || !/(?:RUN|CMD|ENTRYPOINT)\s/.test(fixedDockerfile)) {
      console.warn("[Startup] LLM returned an invalid Dockerfile — skipping");
      return;
    }

    // Post-validate: check all FROM images exist on Docker Hub
    const missing = await validateDockerfileImages(fixedDockerfile);
    if (missing.length > 0) {
      console.warn(
        `[Startup] Repaired Dockerfile references non-existent images: ${missing.join(", ")}`,
      );
    }

    writeFileSync(dockerfilePath, fixedDockerfile, "utf-8");
    console.log(
      `[Startup] LLM repaired Dockerfile (${fixedDockerfile.split("\n").length} lines)`,
    );
  } catch (err) {
    console.warn(
      `[Startup] Dockerfile repair failed: ${err instanceof Error ? err.message : err}`,
    );
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
async function repairInfrastructure(
  llm: OpenAI,
  repoPath: string,
  config: StartupConfig,
  errorOutput: string,
  model?: string,
): Promise<void> {
  const truncatedError = errorOutput.length > 4000
    ? errorOutput.slice(-4000)
    : errorOutput;

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    {
      role: "system",
      content: `You are a DevOps engineer fixing a failed application startup. You have tools to:
- read_file / list_files / search_files — inspect the repository
- write_file — modify shell scripts, compose files, config files, etc.
- run_command — run diagnostic or repair commands (docker logs, sed, chmod, etc.)
- verify_docker_image — check if a Docker image exists

The application failed to start. Your job is to fix the root cause so the SAME startup command can succeed on the next attempt.

Common issues you should fix:
- "cannot attach stdin to a TTY-enabled container" → find and patch scripts that use "docker exec -it" or "docker run -it" to remove the -t flag. Use sed or write_file.
- "database does not exist" → run the database creation command (e.g. docker exec <container> bin/rails db:create db:migrate)
- Compose service errors ("has neither an image nor a build context") → edit the compose file to comment out or remove the broken service
- Permission denied → chmod +x the script, or fix file permissions
- Missing .env file → copy from .env.example or create a minimal one
- Missing config files → create them with sensible defaults
- Port already in use → kill the old process

IMPORTANT:
- Do NOT change the startup command itself — only fix the files/environment so the same command works.
- Make targeted, minimal fixes. Don't rewrite entire files unless necessary.
- Run diagnostic commands first to understand the problem, then apply fixes.
- After fixing, verify the fix worked if possible (e.g. re-read the patched file).`,
    },
    {
      role: "user",
      content: `The application failed to start with this config:

Command: ${config.command}
Prerequisites: ${JSON.stringify(config.prerequisites)}
Docker: ${config.docker}

Error output:
\`\`\`
${truncatedError}
\`\`\`

Investigate the root cause using the tools, then fix it. Reply with a brief summary of what you fixed.`,
    },
  ];

  try {
    console.log("[Startup] Asking LLM to repair infrastructure...");
    const infraHandler = createInfraToolHandler(repoPath);
    const response = await chatWithTools(
      llm,
      messages,
      infraTools,
      infraHandler,
      model,
      15, // generous tool turns for diagnosis + repair
    );
    console.log(`[Startup] Infrastructure repair: ${response.slice(0, 200)}`);
  } catch (err) {
    console.warn(
      `[Startup] Infrastructure repair failed: ${err instanceof Error ? err.message : err}`,
    );
  }
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
 * Replace .NET template placeholders (e.g. TEMPLATE_PORT) in compose files
 * with the actual port from the startup config, so Docker can parse them.
 */
function sanitizeComposeTemplateVars(
  repoPath: string,
  config: StartupConfig,
): void {
  // Collect compose file paths to check:
  // 1. Files explicitly referenced via -f <path> in the command
  // 2. Common compose filenames in the repo root and in any cd target dir
  const filesToCheck = new Set<string>();

  // Extract -f <path> references from the command
  for (const m of config.command.matchAll(/-f\s+(\S+)/g)) {
    filesToCheck.add(m[1]);
  }

  // Detect cd target directory (e.g. "cd templates/Foo && docker compose ...")
  const cdMatch = config.command.match(/cd\s+(\S+)\s*&&/);
  const dirs = [""]; // repo root
  if (cdMatch) dirs.push(cdMatch[1]);

  const defaultNames = [
    "docker-compose.yml",
    "compose.yml",
    "docker-compose.local.yml",
    "compose.local.yml",
    "docker-compose.dev.yml",
    "compose.dev.yml",
    "docker-compose.override.yml",
    "compose.override.yml",
  ];
  for (const dir of dirs) {
    for (const name of defaultNames) {
      filesToCheck.add(dir ? `${dir}/${name}` : name);
    }
  }

  for (const cf of filesToCheck) {
    const filePath = cf.startsWith("/") ? cf : `${repoPath}/${cf}`;
    if (!existsSync(filePath)) continue;

    let content: string;
    try {
      content = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    // Replace TEMPLATE_PORT (bare), ${TEMPLATE_PORT}, $TEMPLATE_PORT
    // and similar .NET template vars like TEMPLATE_HTTPPORT, TEMPLATE_HTTPSPORT
    const sanitized = content.replace(
      /\$\{TEMPLATE_\w*PORT\w*\}|(?<!\$)\bTEMPLATE_\w*PORT\w*\b|\$TEMPLATE_\w*PORT\w*/g,
      String(config.port),
    );

    if (sanitized !== content) {
      writeFileSync(filePath, sanitized);
      console.log(
        `[Startup] Replaced template port placeholder(s) in ${cf} with ${config.port}`,
      );
    }
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
  for (const m of content.matchAll(
    /^\s+(MYSQL_\w+|POSTGRES_\w+|MONGO_\w+):/gm,
  )) {
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

  console.log(
    `[Startup] Created ${envFile} with ${lines.length} default variable(s)`,
  );
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
  // Skip compose files in template directories (they're scaffolds, not working configs)
  const composeFiles = [
    "docker-compose.yml",
    "compose.yml",
    "docker-compose.local.yml",
    "compose.local.yml",
    "docker-compose.dev.yml",
    "compose.dev.yml",
  ];
  for (const cf of composeFiles) {
    if (existsSync(`${repoPath}/${cf}`)) {
      if (!validateComposeBuildContexts(repoPath, cf)) {
        console.log(`[Startup] Skipping ${cf} — build context directory missing`);
        continue;
      }
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
  const dockerHandler = createDockerfileToolHandler(repoPath);
  const messages = generateDockerfilePrompt(stackStr);
  const response = await chatWithTools(
    llm,
    messages,
    dockerfileTools,
    dockerHandler,
    model,
  );

  const content = extractCodeBlock(response);
  if (!content) {
    throw new Error(
      "Failed to generate a valid Dockerfile — LLM did not return a code block",
    );
  }

  // Post-validate: check all FROM images exist on Docker Hub
  const missing = await validateDockerfileImages(content);
  if (missing.length > 0) {
    console.warn(
      `[Startup] Dockerfile references non-existent images: ${missing.join(", ")}`,
    );
  }

  writeFileSync(`${repoPath}/Dockerfile`, content);
  console.log(
    `[Startup] Generated Dockerfile (${content.split("\n").length} lines)`,
  );
}

function extractCodeBlock(text: string): string | null {
  const match = text.match(
    /```(?:dockerfile|docker|Dockerfile)?\s*\n([\s\S]*?)```/i,
  );
  if (match) return match[1].trimEnd() + "\n";

  // Fallback: extract lines that look like Dockerfile instructions
  const lines = text.split("\n");
  const dockerLines = lines.filter(
    (l) =>
      /^(FROM|RUN|COPY|ADD|WORKDIR|EXPOSE|CMD|ENTRYPOINT|ENV|ARG|LABEL|VOLUME|USER|HEALTHCHECK|SHELL|STOPSIGNAL|ONBUILD)\s/i.test(
        l.trim(),
      ) ||
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
  const response = await chatWithTools(
    llm,
    messages,
    codebaseTools,
    handleTool,
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
function ensureDockerIgnore(repoPath: string): void {
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
// Pre-validate and fix startup configs before running
// ---------------------------------------------------------------------------

/**
 * Validate a startup config and rewrite it if problems are detected:
 * 1. Compose files in template dirs → fall back to root Dockerfile
 * 2. Compose files with missing build contexts → fall back to root Dockerfile
 * 3. Compose files using pre-built images → switch to build-from-source
 * 4. Native commands for tools not on host → switch to Docker
 */
function sanitizeStartupConfig(
  repoPath: string,
  config: StartupConfig,
): StartupConfig {
  // --- Docker compose validation ---
  if (config.docker && /docker\s+compose/.test(config.command)) {
    const composeFile = extractComposeFilePath(config.command);

    if (composeFile) {
      // Reject compose files inside templates/ or scaffold directories
      if (/\btemplates?\b|\bscaffold/i.test(composeFile)) {
        console.log(
          `[Startup] Rejecting compose in template dir: ${composeFile} — using root Dockerfile`,
        );
        return fallbackToDockerfile(repoPath, config);
      }

      // Reject compose files with missing build contexts
      const fullPath = `${repoPath}/${composeFile}`;
      if (existsSync(fullPath) && !validateComposeBuildContexts(repoPath, composeFile)) {
        console.log(
          `[Startup] Rejecting compose with missing build context: ${composeFile} — using root Dockerfile`,
        );
        return fallbackToDockerfile(repoPath, config);
      }

      // Reject compose files that pull pre-built images instead of building.
      // We must build from source so code fixes are included in the image.
      // Patch the compose to build from the repo Dockerfile instead.
      if (
        existsSync(fullPath) &&
        composeUsesPrebuiltImages(repoPath, composeFile) &&
        existsSync(`${repoPath}/Dockerfile`)
      ) {
        patchComposeForSourceBuild(repoPath, composeFile);
        // Ensure --build flag is present
        if (!config.command.includes("--build")) {
          config = {
            ...config,
            command: config.command.replace(
              /up\s/,
              "up --build ",
            ),
          };
        }
        console.log(
          `[Startup] Patched compose to build from source instead of pulling pre-built image`,
        );
      }
    }
  }

  // --- Native tool availability check ---
  if (!config.docker) {
    // Check if the primary build tool is available on the host
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
    // Also check the lila.sh / build scripts that invoke tools internally
    // by scanning their first few lines for tool references
    const scriptMatch = config.command.match(/\.\/([\w.-]+\.sh)\b/);
    if (scriptMatch) {
      try {
        const scriptContent = readFileSync(
          `${repoPath}/${scriptMatch[1]}`,
          "utf-8",
        ).slice(0, 2000);
        for (const { re, name } of knownTools) {
          if (re.test(scriptContent) && !isToolAvailable(name)) {
            console.log(
              `[Startup] Script ${scriptMatch[1]} requires "${name}" which is not on host — switching to Docker`,
            );
            return fallbackToDockerfile(repoPath, config);
          }
        }
      } catch { /* ignore */ }
    }
    const fullCommand = [
      ...config.prerequisites,
      config.command,
    ].join(" ");

    for (const { re, name } of knownTools) {
      if (re.test(fullCommand) && !isToolAvailable(name)) {
        console.log(
          `[Startup] "${name}" not found on host — switching to Docker build`,
        );
        return fallbackToDockerfile(repoPath, config);
      }
    }
  }

  return config;
}

/** Extract the compose file path from a docker compose command */
function extractComposeFilePath(command: string): string | null {
  // -f path/to/docker-compose.yml
  const fMatch = command.match(/-f\s+(\S+)/);
  if (fMatch) {
    const file = fMatch[1];
    // Reject non-YAML files (e.g. README.md accidentally picked up)
    if (!/\.ya?ml$/i.test(file)) return null;
    return file;
  }

  // cd some/dir && docker compose up
  const cdMatch = command.match(/cd\s+(\S+)\s*&&/);
  if (cdMatch) {
    // The compose file is in that directory
    return `${cdMatch[1]}/docker-compose.yml`;
  }

  // No -f flag → docker compose uses docker-compose.yml or compose.yml in cwd
  if (/docker\s+compose/.test(command)) {
    return "docker-compose.yml"; // caller should check existence
  }

  return null;
}

/**
 * Fall back to a Docker build from the root Dockerfile.
 * Always returns a Docker config — if no Dockerfile exists yet, the caller
 * (retry loop) will generate one before running.
 */
function fallbackToDockerfile(
  repoPath: string,
  config: StartupConfig,
): StartupConfig {
  // Try compose-based or Dockerfile-based source builds first
  const fromSource =
    buildFromSourceConfig(repoPath, config) ??
    buildDockerfileOnlyConfig(repoPath, config);
  if (fromSource) return fromSource;

  // Return a Docker build+run config — Dockerfile will be generated if missing
  const imageName = "bright-app-local";
  return {
    command: `docker build -t ${imageName} . && docker run -d -p ${config.port}:${config.port} --name ${imageName} ${imageName}`,
    port: config.port,
    prerequisites: [],
    envVars: config.envVars,
    docker: true,
  };
}

/**
 * Strip -t / -it / --tty flags from docker exec / docker run commands.
 * We run non-interactively so TTY-enabled containers fail with
 * "cannot attach stdin to a TTY-enabled container".
 *
 * Handles flags anywhere in the command, not just immediately after docker run:
 *   docker run --rm -it -p 3000:3000 → docker run --rm -i -p 3000:3000
 *   docker exec -e FOO=bar -it container → docker exec -e FOO=bar -i container
 */
function stripDockerTtyFlags(cmd: string): string {
  return cmd
    // Replace standalone -it → -i
    .replace(/\s-it\b/g, " -i")
    // Replace -t when it's a standalone flag (not part of --tag, etc.)
    .replace(/\s-t\s/g, " ")
    // Remove --tty
    .replace(/\s--tty\b/g, "")
    // Handle combined flags containing t (e.g. -dit → -di, -itu → -iu)
    .replace(/\s-([a-zA-Z]*t[a-zA-Z]*)\b/g, (_m, flags: string) => {
      // Only if it looks like short flags (not --tag, --timeout, etc.)
      if (flags.length > 5) return _m; // likely a long-ish flag, skip
      const without = flags.replace(/t/g, "");
      return without ? ` -${without}` : "";
    });
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

async function startApplication(
  repoPath: string,
  config: StartupConfig,
): Promise<ChildProcess> {
  // Sanitize compose template placeholders (e.g. TEMPLATE_PORT from .NET templates)
  if (config.docker && /docker\s+compose/.test(config.command)) {
    sanitizeComposeTemplateVars(repoPath, config);

    // Validate build contexts — fail fast if a compose file references
    // a non-existent directory (e.g. template scaffolds)
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
    console.log(`[Startup] Running prerequisite: ${cmd}`);
    execSync(cmd, {
      cwd: repoPath,
      stdio: "pipe",
      timeout: 300_000,
      maxBuffer: 50 * 1024 * 1024, // 50 MB — large installs produce lots of output
      env: { ...process.env, ...config.envVars },
    });
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
        else
          reject(
            new Error(
              `docker compose exited with code ${code}. Output:\n${outputLines.slice(-30).join("\n")}`,
            ),
          );
      });
    });

    try {
      await Promise.race([composeExitPromise, earlyExitPromise]);
    } catch (err) {
      // --wait fails if ANY container is unhealthy (e.g. watchtower, sidecars).
      // The app container itself may be fine — fall back to port check.
      const errMsg = err instanceof Error ? err.message : String(err);
      if (
        errMsg.includes("unhealthy") ||
        errMsg.includes("exited with code") ||
        errMsg.includes("invalid compose project")
      ) {
        console.warn(
          `[Startup] docker compose --wait failed (${errMsg.slice(0, 200)}), falling back to port check...`,
        );
        logDockerFailure(repoPath);
        try {
          await waitForPort(config.port, 60_000);
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
    await waitForPort(config.port, 120_000);
  } else {
    // Non-docker or docker without --wait
    const portTimeoutMs = config.docker ? 180_000 : 90_000;

    // For `docker run -d`, the shell exits immediately with code 0 after
    // detaching the container.  The container may crash independently.
    // Poll for container health alongside the port check.
    const containerName = command.match(/--name\s+(\S+)/)?.[1];
    const containerCrashPromise = containerName
      ? pollContainerAlive(containerName, portTimeoutMs)
      : new Promise<never>(() => {}); // never resolves

    try {
      await Promise.race([
        waitForPort(config.port, portTimeoutMs),
        earlyExitPromise,
        containerCrashPromise,
      ]);
    } catch (err) {
      if (config.docker) logDockerFailure(repoPath);
      // Append container logs to the error for the LLM repair
      if (containerName) {
        try {
          const logs = execSync(
            `docker logs ${containerName} 2>&1 | tail -30`,
            { encoding: "utf-8", timeout: 10_000 },
          ).trim();
          if (logs) {
            const origMsg = err instanceof Error ? err.message : String(err);
            throw new Error(`${origMsg}\n\nContainer logs:\n${logs}`);
          }
        } catch (logErr) {
          if (logErr instanceof Error && logErr.message.includes("Container logs:")) throw logErr;
        }
      }
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
      "docker",
      ["compose", "ps", "-a", "--format", "{{.Name}}"],
      { cwd: repoPath, encoding: "utf-8", timeout: 10_000 },
    )
      .trim()
      .split("\n")
      .filter(Boolean);

    for (const name of containers) {
      try {
        const containerLog = execFileSync(
          "docker",
          ["logs", "--tail", String(tailLines), name],
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
        "docker",
        ["ps", "-a", "--format", "{{.Names}}", "--filter", "name=nodejs"],
        { encoding: "utf-8", timeout: 10_000 },
      )
        .trim()
        .split("\n")
        .filter(Boolean);

      for (const name of allContainers) {
        try {
          const containerLog = execFileSync(
            "docker",
            ["logs", "--tail", String(tailLines), name],
            { encoding: "utf-8", timeout: 10_000 },
          );
          if (containerLog.trim()) {
            logs.push(`=== ${name} ===\n${containerLog.trim()}`);
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }
  return logs.join("\n\n") || "No container logs available.";
}
