import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { EngineConfig } from "./types.js";

export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface BrightMcpClient {
  getMcpToolSchemas(filter?: string[]): Promise<McpToolSchema[]>;
  callMcpToolRaw(name: string, args: Record<string, unknown>): Promise<string>;
  listProjects(opts?: { q?: string }): Promise<BrightProject[]>;
  listRepeaters(): Promise<BrightRepeater[]>;
  createRepeater(projectId: string, name: string): Promise<BrightRepeater>;
  addEntrypoint(opts: AddEntrypointOpts): Promise<{ id: string }>;
  listEntrypoints(
    projectId: string,
    opts?: { limit?: number },
  ): Promise<BrightEntrypoint[]>;
  addAuth(opts: AddAuthOpts): Promise<{ id: string }>;
  listAuths(projectId: string): Promise<BrightAuth[]>;
  runScan(opts: RunScanOpts): Promise<{ scanId: string }>;
  getScanStatus(scanId: string): Promise<BrightScanStatus>;
  listIssues(
    projectId: string,
    opts?: ListIssuesOpts,
  ): Promise<BrightIssue[]>;
  listTests(): Promise<BrightTest[]>;
  runDiscovery(opts: RunDiscoveryOpts): Promise<{ discoveryId: string }>;
  getDiscoveryStatus(
    projectId: string,
    discoveryId: string,
  ): Promise<BrightDiscoveryStatus>;
  uploadApiDefinition(opts: UploadApiDefOpts): Promise<{ fileId: string }>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Bright domain types
// ---------------------------------------------------------------------------

export interface BrightProject {
  id: string;
  name: string;
}

export interface BrightRepeater {
  id: string;
  name: string;
  status?: string;
}

export interface BrightEntrypoint {
  id: string;
  method: string;
  url: string;
  status?: string;
}

export interface BrightAuth {
  id: string;
  name: string;
  type: string;
}

export interface BrightScanStatus {
  id: string;
  status: string;
  issuesFound?: number;
}

export interface BrightDiscoveryStatus {
  id: string;
  status: string;
}

export interface BrightIssue {
  id: string;
  name: string;
  severity: string;
  url?: string;
  method?: string;
  details?: string;
  remedy?: string;
  entrypointId?: string;
}

export interface BrightTest {
  id: string;
  name: string;
  tag: string;
}

// ---------------------------------------------------------------------------
// Method option types
// ---------------------------------------------------------------------------

export interface AddEntrypointOpts {
  projectId: string;
  repeaterId?: string;
  authObjectId?: string;
  request: {
    method: string;
    url: string;
    headers?: Record<string, string[]> | null;
    body?: string | null;
  };
}

export interface AddAuthOpts {
  name: string;
  projectId: string;
  type: string;
  test: { request: { method: string; url: string } };
  successResponseDetection: Array<{ type: string; statuses: number[] }>;
  config: Record<string, unknown>;
  reauthTriggers?: unknown[];
}

export interface RunScanOpts {
  projectId: string;
  entrypointIds?: string[];
  repeaters: string[];
  tests?: string[];
  authObjectId?: string;
  name?: string;
}

export interface ListIssuesOpts {
  severity?: string[];
  status?: string[];
  limit?: number;
}

export interface RunDiscoveryOpts {
  projectId: string;
  crawlerUrls?: string[];
  fileId?: string;
  repeaters?: string[];
  authObjectId?: string;
}

export interface UploadApiDefOpts {
  projectId?: string;
  url?: string;
  content?: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export async function createBrightMcpClient(
  config: EngineConfig,
): Promise<BrightMcpClient> {
  const mcpUrl = config.brightMcpUrl ?? `https://${config.brightHostname}/api/v1/mcp/sse`;

  const client = new Client({ name: "bright-engine", version: "0.1.0" });

  const headers = { Authorization: `Api-Key ${config.brightToken}` };

  // Try Streamable HTTP first, fall back to SSE
  let connected = false;
  try {
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: { headers },
    });
    await client.connect(transport);
    connected = true;
    console.log("[MCP] Connected via Streamable HTTP");
  } catch {
    console.log("[MCP] Streamable HTTP failed, falling back to SSE");
  }

  if (!connected) {
    const transport = new SSEClientTransport(new URL(mcpUrl), {
      requestInit: { headers },
    });
    await client.connect(transport);
    console.log("[MCP] Connected via SSE");
  }

  let cachedSchemas: McpToolSchema[] | null = null;

  async function callTool<T = unknown>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    console.log(`[MCP] Calling ${name} with args:`, JSON.stringify(args).slice(0, 500));
    const result = await client.callTool({ name, arguments: args });
    const contentArr = Array.isArray(result.content) ? result.content : [];
    const text = contentArr
      .filter(
        (c: unknown): c is { type: "text"; text: string } =>
          typeof c === "object" && c !== null && (c as Record<string, unknown>).type === "text",
      )
      .map((c) => c.text)
      .join("");

    console.log(`[MCP] ${name} response:`, text.slice(0, 500));

    if (result.isError) {
      throw new Error(`Bright MCP tool ${name} failed: ${text}`);
    }

    try {
      return JSON.parse(text ?? "{}") as T;
    } catch {
      return text as unknown as T;
    }
  }

  function unwrapList<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result;
    if (result && typeof result === "object" && "items" in result) {
      return (result as { items: T[] }).items;
    }
    return [];
  }

  return {
    async getMcpToolSchemas(filter) {
      if (!cachedSchemas) {
        const result = await client.listTools();
        cachedSchemas = result.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema as Record<string, unknown>,
        }));
        console.log(`[MCP] Loaded ${cachedSchemas.length} tool schemas`);
      }
      if (filter) {
        return cachedSchemas.filter((t) => filter.includes(t.name));
      }
      return cachedSchemas;
    },

    async callMcpToolRaw(name, args) {
      console.log(`[MCP] Calling ${name} with args:`, JSON.stringify(args).slice(0, 500));
      const result = await client.callTool({ name, arguments: args });
      const contentArr = Array.isArray(result.content) ? result.content : [];
      const text = contentArr
        .filter(
          (c: unknown): c is { type: "text"; text: string } =>
            typeof c === "object" && c !== null && (c as Record<string, unknown>).type === "text",
        )
        .map((c) => c.text)
        .join("");

      console.log(`[MCP] ${name} response:`, text.slice(0, 500));

      if (result.isError) {
        return `Error from Bright API: ${text}`;
      }
      return text || "Success (empty response)";
    },

    async listProjects(opts) {
      return callTool<unknown>("listProjects", opts ?? {}).then(unwrapList<BrightProject>);
    },

    async listRepeaters() {
      return callTool<unknown>("listRepeaters", {}).then(unwrapList<BrightRepeater>);
    },

    async createRepeater(projectId, name) {
      return callTool<BrightRepeater>("createRepeater", { projectId, name }).then((r) => {
        // MCP returns { repeaterId } — normalize to { id }
        const raw = r as unknown as Record<string, unknown>;
        return { id: (raw.repeaterId ?? raw.id ?? "") as string, name: (raw.name ?? name) as string, status: raw.status as string | undefined };
      });
    },

    async addEntrypoint(opts) {
      return callTool<{ id: string }>("addEntrypoint", opts as unknown as Record<string, unknown>).then((r) => {
        // MCP returns { entrypointId } — normalize to { id }
        const raw = r as unknown as Record<string, unknown>;
        return { id: (raw.entrypointId ?? raw.id ?? "") as string };
      });
    },

    async listEntrypoints(projectId, opts) {
      return callTool<unknown>("listEntrypoints", {
        projectId,
        ...opts,
      }).then(unwrapList<BrightEntrypoint>);
    },

    async addAuth(opts) {
      return callTool<{ id: string }>("addAuth", opts as unknown as Record<string, unknown>);
    },

    async listAuths(projectId) {
      return callTool<unknown>("listAuths", { projectId }).then(unwrapList<BrightAuth>);
    },

    async runScan(opts) {
      return callTool<{ scanId: string }>("runScan", opts as unknown as Record<string, unknown>);
    },

    async getScanStatus(scanId) {
      return callTool<BrightScanStatus>("getScanStatus", { scanId });
    },

    async listIssues(projectId, opts) {
      return callTool<unknown>("listIssues", {
        projectId,
        ...(opts ?? {}),
      }).then(unwrapList<BrightIssue>);
    },

    async listTests() {
      return callTool<unknown>("listTests", {}).then(unwrapList<BrightTest>);
    },

    async runDiscovery(opts) {
      return callTool<{ discoveryId: string }>("runDiscovery", opts as unknown as Record<string, unknown>);
    },

    async getDiscoveryStatus(projectId, discoveryId) {
      return callTool<BrightDiscoveryStatus>("getDiscoveryStatus", {
        projectId,
        discoveryId,
      });
    },

    async uploadApiDefinition(opts) {
      return callTool<{ fileId: string }>("uploadApiDefinition", opts as unknown as Record<string, unknown>);
    },

    async close() {
      await client.close();
    },
  };
}
