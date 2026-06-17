import { DEFAULT_MODEL, detectProvider, ModelSelector } from "./inference.js";
import type { EngineConfig, RunMode } from "./types.js";

export function loadConfig(): EngineConfig {
  const brightToken = requireEnv("BRIGHT_TOKEN");
  const brightHostname = process.env.BRIGHT_HOSTNAME ?? "app.brightsec.com";
  const brightProjectId = process.env.BRIGHT_PROJECT_ID;

  // RUN_MODE: "full" (default), "dynamic" (no harness fallback), "function", or "validation"
  const runMode = parseRunMode(process.env.RUN_MODE);
  const sarifPath = process.env.SARIF_PATH ?? undefined;
  if (runMode === "validation" && !sarifPath) {
    throw new Error("SARIF_PATH is required when RUN_MODE=validation");
  }

  // AI_MODEL: single model or comma-separated escalation chain
  // e.g. "gpt-4.1-mini" or "gpt-4.1-mini,gpt-4.1,o3"
  const models = (process.env.AI_MODEL ?? DEFAULT_MODEL)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const modelSelector = new ModelSelector(models);

  // Git / SCM token (single source of truth)
  const gitToken = process.env.REPO_ACCESS_TOKEN ?? "";

  // Inference provider detection
  const inferenceUrl = process.env.INFERENCE_URL ?? "https://api.openai.com/v1";
  const inferenceProvider = detectProvider(inferenceUrl);

  console.log(`[Config] AI model(s): ${modelSelector}`);
  console.log(`[Config] Inference provider: ${inferenceProvider}`);
  console.log(`[Config] Run mode: ${runMode}`);

  return {
    brightToken,
    brightHostname,
    brightProjectId,
    gitToken,
    inferenceUrl,
    inferenceProvider,
    modelSelector,
    runMode,
    sarifPath,
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseRunMode(value: string | undefined): RunMode {
  const raw = (value ?? "full").trim().toLowerCase();
  if (raw === "full" || raw === "dynamic" || raw === "function" || raw === "validation") {
    return raw;
  }
  if (raw === "functional") {
    return "function";
  }
  throw new Error(
    `Invalid RUN_MODE "${value}". Expected one of: full, dynamic, function, validation.`,
  );
}
