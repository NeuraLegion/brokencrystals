import { execSync } from "child_process";

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format a TechStack into a comma-separated string of languages and frameworks.
 */
export function formatTechStack(techStack: {
  languages: string[];
  frameworks: string[];
  serviceRoot?: string;
}): string {
  const stack = [...techStack.languages, ...techStack.frameworks].join(", ");
  if (techStack.serviceRoot && techStack.serviceRoot !== ".") {
    return `${stack} (service: ${techStack.serviceRoot})`;
  }
  return stack;
}

/**
 * Extract an error message from an unknown caught value.
 */
export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Like toErrorMessage but includes stderr/stdout from execSync failures.
 * Use for error messages that will be fed to LLM repair prompts.
 */
export function toDetailedErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const execErr = err as Error & { stderr?: Buffer | string; stdout?: Buffer | string };
    if (execErr.stderr || execErr.stdout) {
      const stderr = String(execErr.stderr ?? "").trim();
      const stdout = String(execErr.stdout ?? "").trim();
      const combined = [stdout, stderr].filter(Boolean).join("\n");
      if (combined.length > 0) {
        // Keep both head and tail — the first-cause exception is often at the
        // top (e.g. PG::FeatureNotSupported, LoadError) while the bottom has
        // the final stack trace / exit message.
        if (combined.length <= 6000) {
          return `${err.message}\n${combined}`;
        }
        const head = combined.slice(0, 2500);
        const tail = combined.slice(-3000);
        return `${err.message}\n${head}\n\n... (${combined.length - 5500} chars omitted) ...\n\n${tail}`;
      }
    }
    return err.message;
  }
  return String(err);
}

/**
 * Extract JSON from an LLM response that may wrap it in markdown code blocks.
 */
export function extractJson(text: string): string {
  // 1. Try code-block extraction first
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // 2. Find a balanced JSON object/array by scanning for matching braces
  const start = text.search(/[\[{]/);
  if (start === -1) return text;

  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  // Fallback: return everything from first brace
  return text.slice(start);
}

/**
 * Block dangerous shell commands that could damage the system.
 */
/**
 * Only allow commands that are either:
 * 1. Docker commands (docker exec, docker ps, docker compose, etc.)
 * 2. Safe host commands scoped to repo work (chmod, cat, grep, ls, etc.)
 * Everything else is blocked — the LLM should never run arbitrary host commands.
 */
export function isDangerousCommand(command: string): boolean {
  // Safe repo-scoped commands for infrastructure repair
  const SAFE_HOST_COMMANDS = new Set([
    "cat", "ls", "head", "tail", "grep", "find", "wc",   // read-only inspection
    "chmod", "chown",                                       // permission fixes
    "sed", "awk",                                           // text transforms
    "cp", "mv", "mkdir", "touch", "ln",                    // file operations
    "echo", "printf", "tee",                                // output/write
    "git",                                                  // version control
    "npm", "npx", "pnpm", "yarn", "bun",                   // JS package managers
    "bundle", "gem", "rake",                                // Ruby
    "pip", "pip3", "python", "python3",                     // Python
    "go", "cargo", "mvn", "gradle", "sbt",                 // Other build tools
    "make", "cmake",                                        // Build systems
    "env", "which", "command", "type", "test", "true",     // Shell builtins
    "sh", "bash", "zsh",                                    // Subshells (for -c "...")
    "curl", "wget",                                         // HTTP (for healthchecks)
    "kill", "pkill",                                        // Process management
    "sleep", "date",                                        // Utilities
    "node",                                                 // Node.js
  ]);

  function getFirstWord(segment: string): string {
    return segment.trim().replace(/^(\w+=\S+\s+)*/, "").split(/\s+/)[0]?.toLowerCase() ?? "";
  }

  // Check the top-level command word (before any pipes/chains)
  const topWord = getFirstWord(command);

  // Docker commands run entirely inside containers — allow without splitting.
  // Splitting on && / || / | would break quoted arguments inside docker exec.
  if (topWord === "docker" || topWord === "docker-compose") {
    return false;
  }

  // For non-docker commands, split on shell operators and check every segment
  const segments = command.split(/\s*(?:\||&&|\|\|)\s*/);
  for (const seg of segments) {
    if (!seg.trim()) continue;
    const word = getFirstWord(seg);
    if (word === "docker" || word === "docker-compose") continue;
    if (!SAFE_HOST_COMMANDS.has(word)) return true;
  }

  // Block piping curl/wget into a shell interpreter
  if (/\b(curl|wget)\b.*\|\s*(sh|bash|zsh)\b/i.test(command)) {
    return true;
  }

  // Block rm -rf on root/home paths
  if (/\brm\s+-rf\s+[/~]/i.test(command)) {
    return true;
  }

  return false;
}

/**
 * Run a shell command safely with output truncation and error handling.
 * Used by LLM tool handlers that need to execute commands in the repo.
 */
export function runShellCommand(
  repoPath: string,
  command: string,
  timeoutMs = 60_000,
): string {
  if (isDangerousCommand(command)) {
    return "Error: dangerous command blocked";
  }

  try {
    const output = execSync(command, {
      cwd: repoPath,
      encoding: "utf-8",
      timeout: timeoutMs,
      maxBuffer: 5 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const result = output.trim();
    return result.length > 10_000
      ? result.slice(-10_000) + "\n... [truncated]"
      : result || "(no output)";
  } catch (err) {
    if (err && typeof err === "object" && "stderr" in err) {
      const errObj = err as Record<string, unknown>;
      const stderr = String(errObj.stderr ?? "").trim();
      const stdout = String(errObj.stdout ?? "").trim();
      return `Command failed:\n${stdout}\n${stderr}`.slice(-5_000);
    }
    return `Command failed: ${toErrorMessage(err)}`;
  }
}

/**
 * Extract content from a fenced code block in LLM output.
 * Supports optional language hints (dockerfile, ruby, python, etc.).
 * Falls back to extracting Dockerfile-like instruction lines.
 */
export function extractCodeBlock(text: string): string | null {
  const match = text.match(
    /```(?:dockerfile|docker|Dockerfile|ruby|python|javascript|typescript|sh|bash|go|java|scala|kotlin|csharp|cs)?\s*\n([\s\S]*?)```/i,
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
