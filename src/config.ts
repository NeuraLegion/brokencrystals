import type { EngineConfig } from "./types.js";
import { ModelSelector, type ModelStrategy, DEFAULT_MODEL } from "./inference.js";

export function loadConfig(): EngineConfig {
  const brightToken = requireEnv("BRIGHT_TOKEN");
  const brightMcpUrl = process.env.BRIGHT_MCP_URL;
  const brightHostname = process.env.BRIGHT_HOSTNAME
    ?? (brightMcpUrl ? new URL(brightMcpUrl).hostname : "app.brightsec.com");
  const brightProjectId = process.env.BRIGHT_PROJECT_ID;
  const inferenceModel = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

  // Model escalation: "static" (default) or "escalating"
  const strategy = (process.env.OPENAI_MODEL_STRATEGY ?? "static") as ModelStrategy;
  const tiers = process.env.OPENAI_MODEL_TIERS
    ? process.env.OPENAI_MODEL_TIERS.split(",").map(s => s.trim()).filter(Boolean)
    : [inferenceModel];
  const modelSelector = new ModelSelector(strategy, tiers);
  console.log(`[Config] Model strategy: ${modelSelector}`);

  return { brightToken, brightHostname, brightMcpUrl, brightProjectId, inferenceModel, modelSelector };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
