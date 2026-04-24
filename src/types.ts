import type OpenAI from "openai";
import type { Platform } from "./platform.js";

import type { ModelSelector, InferenceProvider } from "./inference.js";

// ---------------------------------------------------------------------------
// Bright API context — avoids threading brightToken + brightHostname everywhere
// ---------------------------------------------------------------------------

export interface BrightApiContext {
  brightToken: string;
  brightHostname: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface EngineConfig extends BrightApiContext {
  brightProjectId?: string;
  gitToken: string;
  inferenceUrl: string;
  inferenceProvider: InferenceProvider;
  modelSelector: ModelSelector;
  runMode: RunMode;
}

// ---------------------------------------------------------------------------
// Tech stack & discovery
// ---------------------------------------------------------------------------

export interface TechStack {
  languages: string[];
  frameworks: string[];
  databases: string[];
  /** Relative path to the best service to build/test in a monorepo (e.g. "src/WebApp"). "." for single-project repos. */
  serviceRoot: string;
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
// Project discovery — LLM-based infrastructure analysis
// ---------------------------------------------------------------------------

/** A companion service the application requires (database, cache, queue, etc.) */
export interface DiscoveredService {
  /** Service name used in compose (e.g. "db", "redis", "elasticsearch") */
  name: string;
  /** Docker image to use (e.g. "pgvector/pgvector:pg16", "redis:7-alpine") */
  image: string;
  /** Why this service is needed */
  reason: string;
  /** Environment variables for the service container */
  environment?: Record<string, string>;
  /** Port the service listens on */
  port?: number;
}

/** Output of the LLM project discovery phase */
export interface ProjectDiscovery {
  /** Companion services the app depends on */
  services: DiscoveredService[];
  /** Config files that need patching for Docker networking */
  configNotes: string[];
  /** Environment variables the app container needs */
  appEnvironment: Record<string, string>;
  /** Notes about special build requirements */
  buildNotes: string[];
  /** Application port */
  port: number;
  /** Recommended health check path */
  healthCheckPath?: string;
  /** Setup steps to run after the app starts (e.g. complete a setup wizard) */
  postStartSetup?: string[];
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
  /** Commands to run AFTER the app starts but BEFORE the health check (e.g. DB migrations) */
  postStartCommands?: string[];
  /** Path to probe for health checks instead of "/" (e.g. "/srv/status", "/health") */
  healthCheckPath?: string;
  /** AI-generated summary of the health check response (e.g. "valid JSON forum data", "setup wizard page") */
  healthCheckSummary?: string;
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

export type RunMode = "full" | "dynamic" | "function";

export interface OrchestratorContext {
  repoPath: string;
  platform: Platform;
  llm: OpenAI;
  config: EngineConfig;
}

// ---------------------------------------------------------------------------
// Function harness
// ---------------------------------------------------------------------------

/** A critical function identified by the LLM for harness-based scanning. */
export interface HarnessTarget {
  /** Function/method name (e.g. "fetch", "parse", "findOne") */
  name: string;
  /** File path relative to repo root */
  file: string;
  /** Class or module that contains the function (e.g. "FileService", "UploadsController") */
  className: string;
  /** Parameter names and sample values */
  params: Array<{ name: string; type: string; sample: string }>;
  /** What infrastructure this function needs */
  deps: ("db" | "redis" | "filesystem" | "none" | "http")[];
  /** Vulnerability types worth testing */
  vulnTypes: string[];
  /** The HTTP method for the harness endpoint */
  httpMethod: "GET" | "POST" | "PUT";
  /** Brief description of what the function does */
  description: string;
  /** Bootstrapping tier: 1=no framework, 2=DB only, 3=full framework */
  tier?: 1 | 2 | 3;
  /** Minimal require/import statements to load this target */
  requireStatements?: string[];
}

/** Generated harness configuration. */
export interface HarnessConfig {
  /** Path to the generated harness file (absolute) */
  harnessFile: string;
  /** Command to start the harness server */
  startCommand: string;
  /** Port the harness listens on */
  port: number;
  /** Whether the harness runs inside Docker */
  docker: boolean;
  /** Endpoints exposed by the harness */
  endpoints: HarnessEndpoint[];
}

/** A single endpoint in the generated harness. */
export interface HarnessEndpoint {
  /** HTTP method */
  method: string;
  /** Path (e.g. "/harness/file-fetch") */
  path: string;
  /** The HarnessTarget this endpoint wraps */
  target: HarnessTarget;
  /** Sample request body or query params */
  sampleBody?: string;
  /** Content type */
  contentType?: string;
}
