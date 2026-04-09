import type { EngineConfig } from "./types.js";

export function loadConfig(): EngineConfig {
  const brightToken = requireEnv("BRIGHT_TOKEN");
  const brightMcpUrl = process.env.BRIGHT_MCP_URL;
  const brightHostname = process.env.BRIGHT_HOSTNAME
    ?? (brightMcpUrl ? new URL(brightMcpUrl).hostname : "app.brightsec.com");
  const brightProjectId = process.env.BRIGHT_PROJECT_ID;
  const inferenceModel = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";

  return { brightToken, brightHostname, brightMcpUrl, brightProjectId, inferenceModel };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
