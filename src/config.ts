import type { EngineConfig } from "./types.js";

export function loadConfig(): EngineConfig {
  const jobId = requireEnv("GITHUB_JOB_ID");
  const apiToken = requireEnv("GITHUB_PLATFORM_API_TOKEN");
  const apiUrl = requireEnv("GITHUB_PLATFORM_API_URL");
  const nonce = process.env.GITHUB_JOB_NONCE;
  const brightToken = requireEnv("BRIGHT_TOKEN");
  const brightMcpUrl = process.env.BRIGHT_MCP_URL;
  const brightHostname = process.env.BRIGHT_HOSTNAME
    ?? (brightMcpUrl ? new URL(brightMcpUrl).hostname : "app.brightsec.com");
  const brightProjectId = process.env.BRIGHT_PROJECT_ID;

  return { jobId, apiToken, apiUrl, nonce, brightToken, brightHostname, brightMcpUrl, brightProjectId };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
