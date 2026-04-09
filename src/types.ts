import type OpenAI from "openai";
import type { Platform } from "./platform.js";
import type { BrightMcpClient } from "./mcp-client.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface EngineConfig {
  brightToken: string;
  brightHostname: string;
  brightMcpUrl?: string;
  brightProjectId?: string;
  inferenceModel: string;
}

// ---------------------------------------------------------------------------
// Tech stack & discovery
// ---------------------------------------------------------------------------

export interface TechStack {
  languages: string[];
  frameworks: string[];
  databases: string[];
}

export interface DiscoveredEndpoint {
  method: string;
  path: string;
  filePath: string;
  fullUrl?: string;
  headers?: Record<string, string[]>;
  queryParams?: Array<{ name: string; value: string }>;
  body?: string | null;
  contentType?: string;
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

export interface StartupConfig {
  command: string;
  port: number;
  prerequisites: string[];
  envVars: Record<string, string>;
  docker: boolean;
}

// ---------------------------------------------------------------------------
// Findings & fixes
// ---------------------------------------------------------------------------

export interface Finding {
  id: string;
  name: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  url: string;
  method: string;
  details: string;
  remedy: string;
  entrypointId?: string;
  issueId: string;
}

export interface FilePatch {
  path: string;
  content: string;
}

export interface SecurityFix {
  vulnerability: Finding;
  files: FilePatch[];
  summary: string;
  verified: boolean;
}

// ---------------------------------------------------------------------------
// Orchestrator context
// ---------------------------------------------------------------------------

export interface OrchestratorContext {
  repoPath: string;
  platform: Platform;
  llm: OpenAI;
  bright: BrightMcpClient;
  config: EngineConfig;
}
