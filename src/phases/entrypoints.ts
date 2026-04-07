import type { DiscoveredEndpoint } from "../types.js";
import type { BrightMcpClient } from "../mcp-client.js";
import { toErrorMessage } from "../utils.js";

const CONFLICT_MSG = "already exists";

export async function registerEntrypoints(
  bright: BrightMcpClient,
  projectId: string,
  endpoints: DiscoveredEndpoint[],
  baseUrl: string,
  repeaterId: string,
  authObjectId?: string,
): Promise<string[]> {
  const entrypointIds: string[] = [];

  for (const ep of endpoints) {
    const path = resolvePath(ep.path);
    const fullUrl = `${baseUrl}${path}`;

    console.log(
      `[Entrypoints] Adding ${ep.method} ${fullUrl}` +
        (authObjectId ? ` [auth: ${authObjectId}]` : " [no auth]"),
    );

    // Build request object with all available data
    const request: Record<string, unknown> = {
      method: ep.method,
      url: fullUrl,
    };

    // Add headers — ensure Content-Type for POST/PUT/PATCH
    const needsBody = ["POST", "PUT", "PATCH"].includes(ep.method.toUpperCase());
    const contentType = ep.contentType ?? (needsBody ? "application/json" : undefined);

    if (ep.headers || contentType) {
      const headers: Record<string, string[]> = { ...(ep.headers ?? {}) };
      if (contentType && !headers["Content-Type"]) {
        headers["Content-Type"] = [contentType];
      }
      request.headers = headers;
    }

    // Add body for methods that expect one
    if (needsBody) {
      request.body = ep.body ?? "{}";
    }

    // Build the full addEntrypoint args
    const args: Record<string, unknown> = { projectId, request, repeaterId };
    if (authObjectId) {
      args.authObjectId = authObjectId;
    }

    try {
      const result = await bright.callMcpToolRaw("addEntrypoint", args);

      // Parse the entrypoint ID from the response
      let epId: string | undefined;
      try {
        const parsed = JSON.parse(result);
        epId = parsed.entrypointId ?? parsed.id;
      } catch {
        // Response wasn't JSON — check for conflict
      }

      if (epId) {
        entrypointIds.push(epId);
      } else if (result.includes(CONFLICT_MSG)) {
        // EP already exists — look up the existing ID
        const existingId = await findExistingEntrypoint(bright, projectId, fullUrl, ep.method);
        if (existingId) {
          console.log(`[Entrypoints] Reusing existing EP ${existingId} for ${ep.method} ${fullUrl}`);
          entrypointIds.push(existingId);
        } else {
          console.warn(`[Entrypoints] Conflict but could not find existing EP for ${ep.method} ${fullUrl}`);
        }
      } else if (result.startsWith("Error")) {
        console.error(`[Entrypoints] Failed ${ep.method} ${fullUrl}: ${result.slice(0, 300)}`);
      } else {
        console.warn(`[Entrypoints] Unexpected response for ${ep.method} ${fullUrl}: ${result.slice(0, 200)}`);
      }
    } catch (err) {
      console.error(`[Entrypoints] Failed ${ep.method} ${fullUrl}: ${toErrorMessage(err)}`);
    }
  }

  console.log(`[Entrypoints] Registered ${entrypointIds.length}/${endpoints.length} entrypoints`);
  return entrypointIds;
}

async function findExistingEntrypoint(
  bright: BrightMcpClient,
  projectId: string,
  url: string,
  method: string,
): Promise<string | undefined> {
  try {
    // Extract path from URL for the search query
    const urlPath = new URL(url).pathname;
    const response = await bright.callMcpToolRaw("listEntrypoints", {
      projectId,
      q: urlPath,
      method: [method.toUpperCase()],
      limit: 10,
    });
    const parsed = JSON.parse(response);
    const items = Array.isArray(parsed) ? parsed : parsed.items ?? [];
    // Find exact URL match
    const match = items.find(
      (ep: { url?: string; method?: string }) =>
        ep.url === url && ep.method?.toUpperCase() === method.toUpperCase(),
    );
    return match?.id;
  } catch (err) {
    console.error(`[Entrypoints] Failed to look up existing EP: ${toErrorMessage(err)}`);
    return undefined;
  }
}

function resolvePath(path: string): string {
  return path
    .replace(/:(\w+)/g, "1")
    .replace(/\{(\w+)\}/g, "1");
}

/**
 * After registering entrypoints with auth, fetch one back via getEntrypoint
 * and log the response to verify if auth is working.
 */
export async function verifyEntrypointAuth(
  bright: BrightMcpClient,
  projectId: string,
  entrypointId: string,
): Promise<{ ok: boolean; detail: string }> {
  try {
    console.log(`[Entrypoints] Verifying auth on entrypoint ${entrypointId}...`);
    const raw = await bright.callMcpToolRaw("getEntrypoint", { projectId, entrypointId });
    console.log(`[Entrypoints] getEntrypoint response: ${raw.slice(0, 1000)}`);

    const data = JSON.parse(raw);
    const status = data.response?.status ?? data.status;
    if (status && (status === 401 || status === 403)) {
      return { ok: false, detail: `Entrypoint returned HTTP ${status} — auth likely not working` };
    }
    return { ok: true, detail: `Entrypoint response: ${JSON.stringify(data.response ?? {}).slice(0, 300)}` };
  } catch (err) {
    const msg = toErrorMessage(err);
    console.warn(`[Entrypoints] Failed to verify entrypoint auth: ${msg}`);
    return { ok: true, detail: `Could not verify: ${msg}` };
  }
}
