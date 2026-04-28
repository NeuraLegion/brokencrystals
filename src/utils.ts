import { execSync } from "child_process";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Fetch timeout constants (milliseconds) — used across all phases
// ---------------------------------------------------------------------------

/** Quick connectivity poll (startup waiter, harness liveness) */
export const FETCH_TIMEOUT_QUICK = 3_000;
/** Simple health/status checks, setup wizard GETs */
export const FETCH_TIMEOUT_SHORT = 5_000;
/** Auth login flows, rendered page loads */
export const FETCH_TIMEOUT_MEDIUM = 8_000;
/** Standard API calls, Docker Hub verification */
export const FETCH_TIMEOUT_DEFAULT = 10_000;
/** Web search, HTML probes, complex requests */
export const FETCH_TIMEOUT_LONG = 15_000;
/** Long-running auth test operations */
export const FETCH_TIMEOUT_EXTENDED = 120_000;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/**
 * Extract Set-Cookie values from a fetch Response's headers.
 * Avoids the `as any` cast needed because TypeScript's built-in Headers
 * type may not include `getSetCookie()` (added in Node 20 / undici).
 */
export function extractSetCookies(headers: Headers): string[] {
  const h = headers as unknown as { getSetCookie?: () => string[] };
  return h.getSetCookie?.() ?? [];
}

// ---------------------------------------------------------------------------
// Severity helpers (shared across orchestrator, findings, progress)
// ---------------------------------------------------------------------------

export const SEVERITY_ORDER: Record<string, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

/** Dedup key for findings — same vuln type + method + URL = same finding */
export function findingKey(f: { name: string; method: string; url: string }): string {
  return `${f.name}::${f.method}::${f.url}`;
}

/** Build a severity breakdown string like "2 Critical, 1 High" */
export function buildSeveritySummary(findings: { severity: string }[]): string {
  const bySev: Record<string, number> = {};
  for (const f of findings) {
    bySev[f.severity] = (bySev[f.severity] ?? 0) + 1;
  }
  return Object.entries(bySev)
    .sort(([a], [b]) => (SEVERITY_ORDER[a] ?? 4) - (SEVERITY_ORDER[b] ?? 4))
    .map(([sev, count]) => `${count} ${sev}`)
    .join(", ");
}

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
  databases?: string[];
  serviceRoot?: string;
}): string {
  const parts = [...techStack.languages, ...techStack.frameworks];
  if (techStack.databases?.length) {
    parts.push(...techStack.databases);
  }
  const stack = parts.join(", ");
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
const SAFE_HOST_COMMANDS = new Set([
  "cat", "ls", "head", "tail", "grep", "find", "wc",   // read-only inspection
  "chmod", "chown",                                       // permission fixes
  "sed", "awk",                                           // text transforms
  "cp", "mv", "mkdir", "touch", "ln", "rm",              // file operations
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

export function isDangerousCommand(command: string): boolean {

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
      ? "... [truncated beginning]\n" + result.slice(-10_000)
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
    /```(?:dockerfile|docker|Dockerfile|ruby|python|javascript|typescript|sh|bash|go|java|scala|kotlin|csharp|cs|yaml|yml|json|xml|toml|ini|conf|nginx|sql|text|plaintext|txt)?\s*\n([\s\S]*?)```/i,
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

// ---------------------------------------------------------------------------
// HTML text extraction — strip scripts/styles/tags, collapse whitespace
// Used by startup health check to analyze HTML pages without truncation noise.
// ---------------------------------------------------------------------------

export function stripHtmlForAnalysis(html: string): string {
  // Replace <script> blocks but preserve src attributes as markers (SPA detection)
  const stripped = html
    .replace(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/script>/gi,
      (_m, src: string) => ` [script: ${src}] `)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // Preserve custom elements / SPA root markers before stripping tags
    .replace(/<(app-root|consumer-root|next-root|nuxt|div\s+id\s*=\s*["'](?:root|app|__next|__nuxt)["'])[^>]*>/gi,
      (_m, tag: string) => ` [SPA root: <${tag}>] `)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
  return stripped;
}

// ---------------------------------------------------------------------------
// Save probe response body to temp file for LLM read_file access
// ---------------------------------------------------------------------------

export const PROBE_RESPONSE_DIR = "/tmp/bright_probe_responses";
let _probeCounter = 0;

export function saveProbeBody(
  bodyText: string,
  contentType: string,
): string | null {
  if (bodyText.length <= 2000) return null;

  try {
    mkdirSync(PROBE_RESPONSE_DIR, { recursive: true });
  } catch { /* ignore */ }

  const ext = contentType.includes("json") ? "json"
    : contentType.includes("html") ? "html"
    : "txt";
  const filePath = `${PROBE_RESPONSE_DIR}/response_${++_probeCounter}.${ext}`;

  try {
    writeFileSync(filePath, bodyText, "utf-8");
    return filePath;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Inject env vars from INFRA_REPAIR hint into docker-compose.yml
// ---------------------------------------------------------------------------

/**
 * Parse env var assignments from an INFRA_REPAIR hint string and inject them
 * into the first service's `environment:` block in docker-compose.yml.
 * Returns the list of injected KEY=VALUE pairs, or empty if nothing was done.
 */
export function injectEnvVarsFromHint(repoPath: string, hint: string): string[] {
  // Match KEY=VALUE patterns (uppercase key, value can be quoted or unquoted)
  const envPattern = /\b([A-Z][A-Z0-9_]{2,})=("([^"]*)"|'([^']*)'|(\S+))/g;
  const envVars: Array<[string, string]> = [];
  let m: RegExpExecArray | null;
  while ((m = envPattern.exec(hint)) !== null) {
    const key = m[1];
    const value = m[3] ?? m[4] ?? m[5]; // captured from "...", '...', or bare
    envVars.push([key, value]);
  }

  if (envVars.length === 0) return [];

  const composePaths = [
    join(repoPath, "docker-compose.yml"),
    join(repoPath, "docker-compose.yaml"),
    join(repoPath, "compose.yml"),
    join(repoPath, "compose.yaml"),
  ];

  const composePath = composePaths.find((p) => existsSync(p));
  if (!composePath) return [];

  let content = readFileSync(composePath, "utf-8");
  const injected: string[] = [];

  for (const [key, value] of envVars) {
    // Skip if already present in the compose file
    if (content.includes(`${key}=`) || content.includes(`${key}:`)) continue;

    // Find the first `environment:` block and append the variable
    const envBlockMatch = content.match(/^(\s*)environment:\s*$/m)
      ?? content.match(/^(\s*)environment:\s*\n/m);
    if (envBlockMatch) {
      const indent = envBlockMatch[1] + "  ";
      const insertPos = (envBlockMatch.index ?? 0) + envBlockMatch[0].length;
      const envLine = `${indent}- ${key}=${value}\n`;
      content = content.slice(0, insertPos) + envLine + content.slice(insertPos);
      injected.push(`${key}=${value}`);
    }
  }

  if (injected.length > 0) {
    writeFileSync(composePath, content, "utf-8");
    console.log(`[Utils] Injected env vars into ${composePath}: ${injected.join(", ")}`);
  }
  return injected;
}
