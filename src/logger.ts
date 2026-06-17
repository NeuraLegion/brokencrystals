import { mkdirSync, appendFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { format } from "util";

// ---------------------------------------------------------------------------
// Central logger
//
// Customer binaries must keep stdout clean and free of internal logic, while
// still giving us everything we need for support. Strategy:
//
//   • Customer-facing stdout  → milestones (progress) + high-level errors only.
//   • Full detail (every console.* line) → a local log file, ALWAYS, with
//     secrets redacted. The customer can send us this file for support.
//   • BRIGHT_DEBUG=1          → mirror the full detail to stdout too (for us).
//
// All sinks pass through secret redaction.
// ---------------------------------------------------------------------------

const DEBUG =
  process.env.BRIGHT_DEBUG === "1" ||
  process.env.BRIGHT_DEBUG === "true" ||
  process.env.BRIGHT_DEBUG === "yes";

let logFile: string | undefined;
let fileSinkBroken = false;

// Secret values to scrub from every log line.
const secrets = new Set<string>();

const SECRET_ENV_KEYS = [
  "BRIGHT_TOKEN",
  "REPO_ACCESS_TOKEN",
  "OPENAI_API_KEY",
  "INFERENCE_TOKEN",
  "GIT_TOKEN",
];

/** Register a literal secret value to redact from all log output. */
export function addSecret(value: string | undefined): void {
  if (value && value.length >= 6) secrets.add(value);
}

/** Pull known secret env vars into the redaction set. */
function loadEnvSecrets(): void {
  for (const k of SECRET_ENV_KEYS) addSecret(process.env[k]);
}

/** Redact known secret literals and common credential patterns. */
export function redact(line: string): string {
  let out = line;
  for (const s of secrets) {
    if (!s) continue;
    out = out.split(s).join("«redacted»");
  }
  // Authorization headers / bearer / api-key tokens
  out = out.replace(
    /\b(Authorization"?\s*[:=]\s*"?)(?:Bearer\s+|Api-Key\s+)?[A-Za-z0-9._\-]{8,}/gi,
    "$1«redacted»",
  );
  // Set-Cookie values
  out = out.replace(/\b(Set-Cookie"?\s*[:=]\s*"?)[^"\n,;]+/gi, "$1«redacted»");
  // Bare bearer tokens
  out = out.replace(/\bBearer\s+[A-Za-z0-9._\-]{8,}/g, "Bearer «redacted»");
  return out;
}

function timestamp(): string {
  return new Date().toLocaleString("sv-SE", { hour12: false }).replace(" ", "T");
}

/** Initialize the file sink. Safe to call once at startup. */
export function initLogger(): void {
  loadEnvSecrets();
  try {
    const dir = join(homedir(), ".bright-agent", "logs");
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    logFile = join(dir, `run-${stamp}.log`);
    appendFileSync(logFile, `# Bright Agent run log — ${new Date().toISOString()}\n`);
  } catch {
    // If we can't open a log file, fall back to stdout-only (debug behavior).
    fileSinkBroken = true;
    logFile = undefined;
  }
}

export function logFilePath(): string | undefined {
  return logFile;
}

function writeFileLine(line: string): void {
  if (!logFile || fileSinkBroken) return;
  try {
    appendFileSync(logFile, line + "\n");
  } catch {
    fileSinkBroken = true;
  }
}

/**
 * Internal/verbose channel — full detail. Always written to the log file
 * (redacted); shown on stdout only in debug mode. This is where every routed
 * console.* line and all stage internals go.
 */
function internal(stream: "log" | "warn" | "error", args: unknown[]): void {
  const line = redact(`${timestamp()} ${format(...(args as [unknown, ...unknown[]]))}`);
  writeFileLine(line);
  if (DEBUG || (fileSinkBroken && stream === "error")) {
    (stream === "error" ? process.stderr : process.stdout).write(line + "\n");
  } else if (fileSinkBroken && DEBUG) {
    process.stdout.write(line + "\n");
  }
}

/** Customer-facing progress milestone → stdout (clean) + log file. */
export function progress(message: string): void {
  const clean = redact(message);
  process.stdout.write(`${clean}\n`);
  writeFileLine(`${timestamp()} [progress] ${clean}`);
}

/** Customer-facing, high-level error → stderr (clean) + log file (full). */
export function logError(message: string): void {
  const clean = redact(message);
  process.stderr.write(`${clean}\n`);
  writeFileLine(`${timestamp()} [error] ${clean}`);
}

/**
 * Route console.log / .info / .debug / .warn / .error through the internal
 * channel so existing call sites need no changes: they go to the log file
 * (redacted) and only surface on stdout under BRIGHT_DEBUG.
 */
export function installConsoleRouting(): void {
  console.log = (...args: unknown[]) => internal("log", args);
  console.info = (...args: unknown[]) => internal("log", args);
  console.debug = (...args: unknown[]) => internal("log", args);
  console.warn = (...args: unknown[]) => internal("warn", args);
  console.error = (...args: unknown[]) => internal("error", args);
}

export const logger = {
  init: initLogger,
  installConsoleRouting,
  progress,
  error: logError,
  addSecret,
  redact,
  logFilePath,
  isDebug: () => DEBUG,
};
