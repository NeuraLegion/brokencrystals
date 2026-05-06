import type { EngineConfig, RunMode } from "./types.js";
import { ModelSelector, DEFAULT_MODEL, detectProvider } from "./inference.js";

export function loadConfig(): EngineConfig {
  const brightToken = requireEnv("BRIGHT_TOKEN");
  const brightHostname = process.env.BRIGHT_HOSTNAME ?? "app.brightsec.com";
  const brightProjectId = process.env.BRIGHT_PROJECT_ID;

  // RUN_MODE: "full" (default), "dynamic" (no harness fallback), or "function"
  const runMode = parseRunMode(process.env.RUN_MODE);

  // AI_MODEL: single model or comma-separated escalation chain
  // e.g. "gpt-4.1-mini" or "gpt-4.1-mini,gpt-4.1,o3"
  const models = (process.env.AI_MODEL ?? DEFAULT_MODEL)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const modelSelector = new ModelSelector(models);

  // Git token resolution (single source of truth)
  const gitToken =
    process.env.GITHUB_GIT_TOKEN ??
    process.env.GIT_TOKEN ??
    process.env.GITHUB_TOKEN ??
    "";

  // Inference provider detection
  const inferenceUrl =
    process.env.GITHUB_INFERENCE_URL ?? "https://api.openai.com/v1";
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
  if (raw === "full" || raw === "dynamic" || raw === "function") {
    return raw;
  }
  if (raw === "functional") {
    return "function";
  }
  throw new Error(
    `Invalid RUN_MODE "${value}". Expected one of: full, dynamic, function (or functional).`,
  );
}
