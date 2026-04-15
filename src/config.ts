import type { EngineConfig } from "./types.js";
import { ModelSelector, DEFAULT_MODEL, detectProvider } from "./inference.js";

export function loadConfig(): EngineConfig {
  const brightToken = requireEnv("BRIGHT_TOKEN");
  const brightMcpUrl = process.env.BRIGHT_MCP_URL;
  const brightHostname = process.env.BRIGHT_HOSTNAME
    ?? (brightMcpUrl ? new URL(brightMcpUrl).hostname : "app.brightsec.com");
  const brightProjectId = process.env.BRIGHT_PROJECT_ID;

  // AI_MODEL: single model or comma-separated escalation chain
  // e.g. "gpt-4.1-mini" or "gpt-4.1-mini,gpt-4.1,o3"
  const models = (process.env.AI_MODEL ?? DEFAULT_MODEL)
    .split(",").map(s => s.trim()).filter(Boolean);
  const modelSelector = new ModelSelector(models);

  // Inference provider detection
  const inferenceUrl =
    process.env.GITHUB_INFERENCE_URL ?? "https://api.openai.com/v1";
  const inferenceProvider = detectProvider(inferenceUrl);

  console.log(`[Config] AI model(s): ${modelSelector}`);
  console.log(`[Config] Inference provider: ${inferenceProvider}`);

  return { brightToken, brightHostname, brightMcpUrl, brightProjectId, inferenceProvider, modelSelector };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
