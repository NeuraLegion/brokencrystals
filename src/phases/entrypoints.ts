import type { DiscoveredEndpoint } from "../types.js";
import type { BrightMcpClient } from "../mcp-client.js";
import { toErrorMessage } from "../utils.js";

const CONFLICT_MSG = "already exists";

export interface RegisteredEntrypoint {
  endpoint: DiscoveredEndpoint;
  entrypointId: string;
}

export async function registerEntrypoints(
  bright: BrightMcpClient,
  projectId: string,
  endpoints: DiscoveredEndpoint[],
  baseUrl: string,
  repeaterId: string,
  authObjectId?: string,
): Promise<RegisteredEntrypoint[]> {
  const registered: RegisteredEntrypoint[] = [];

  for (const ep of endpoints) {
    const path = resolvePath(ep.path);
    let fullUrl = `${baseUrl}${path}`;

    // Append query params to the URL if present
    if (ep.queryParams && ep.queryParams.length > 0) {
      const params = new URLSearchParams(
        ep.queryParams.map((p) => [p.name, p.value]),
      );
      fullUrl += `?${params.toString()}`;
    }

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
      request.body = sanitizeBody(ep.body ?? "{}");
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
        registered.push({ endpoint: ep, entrypointId: epId });
      } else if (result.includes(CONFLICT_MSG)) {
        // EP already exists — look up the existing ID
        const existingId = await findExistingEntrypoint(bright, projectId, fullUrl, ep.method);
        if (existingId) {
          console.log(`[Entrypoints] Reusing existing EP ${existingId} for ${ep.method} ${fullUrl}`);
          registered.push({ endpoint: ep, entrypointId: existingId });
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

  console.log(`[Entrypoints] Registered ${registered.length}/${endpoints.length} entrypoints`);
  return registered;
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

/**
 * Check each registered entrypoint's response status and remove any that
 * return 404 — these waste scan time and produce no useful results.
 */
export async function pruneDeadEntrypoints(
  bright: BrightMcpClient,
  projectId: string,
  entries: RegisteredEntrypoint[],
  brightToken: string,
  brightHostname: string,
): Promise<RegisteredEntrypoint[]> {
  const alive: RegisteredEntrypoint[] = [];
  const dead: string[] = [];

  for (const entry of entries) {
    try {
      const raw = await bright.callMcpToolRaw("getEntrypoint", { projectId, entrypointId: entry.entrypointId });
      const data = JSON.parse(raw);
      const status = data.response?.status ?? data.status;

      if (status === 404) {
        const url = data.request?.url ?? data.url ?? entry.entrypointId;
        console.log(`[Entrypoints] ✗ Removing 404 entrypoint: ${url}`);
        dead.push(entry.entrypointId);
      } else {
        alive.push(entry);
      }
    } catch {
      // If we can't check it, keep it — don't drop potentially valid EPs
      alive.push(entry);
    }
  }

  // Delete the dead entrypoints in parallel
  await Promise.allSettled(
    dead.map((epId) => deleteEntrypoint(brightToken, brightHostname, projectId, epId)),
  );

  if (dead.length > 0) {
    console.log(`[Entrypoints] Pruned ${dead.length} dead (404) entrypoint(s), ${alive.length} remaining`);
  }

  return alive;
}

async function deleteEntrypoint(
  brightToken: string,
  brightHostname: string,
  projectId: string,
  entrypointId: string,
): Promise<void> {
  try {
    const res = await fetch(
      `https://${brightHostname}/api/v2/projects/${encodeURIComponent(projectId)}/entry-points/${encodeURIComponent(entrypointId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Api-Key ${brightToken}` },
      },
    );
    if (res.ok || res.status === 204) {
      console.log(`[Entrypoints] Deleted entrypoint ${entrypointId}`);
    } else if (res.status === 404) {
      // Already gone — not a problem
    } else {
      console.warn(`[Entrypoints] Failed to delete entrypoint ${entrypointId}: ${res.status}`);
    }
  } catch (err) {
    console.warn(`[Entrypoints] Failed to delete entrypoint ${entrypointId}: ${err}`);
  }
}

/**
 * Ensure the body string is valid, compact JSON.
 * The LLM sometimes generates multi-line JSON (especially for GraphQL queries)
 * with literal newlines inside string values, which breaks JSON parsing on the
 * receiving end ("Unexpected token \\n in JSON at position …").
 */
function sanitizeBody(body: string): string {
  try {
    // Parse and re-serialize → collapses formatting and properly escapes
    // any characters that need escaping inside string values.
    const parsed = JSON.parse(body);
    return JSON.stringify(parsed);
  } catch {
    // If it's not valid JSON at all, compact whitespace as a best-effort fix
    return body.replace(/\n\s*/g, " ").trim();
  }
}
