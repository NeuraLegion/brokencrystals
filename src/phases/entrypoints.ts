import type { DiscoveredEndpoint, BrightApiContext } from "../types.js";
import type { AppHealthMonitor } from "../app-health.js";
import { toErrorMessage } from "../utils.js";

const CONCURRENCY = 3;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;
const JITTER_MS = 250;

function isTransientHttpError(status: number, body: string): boolean {
  if (status >= 500) return true;
  if (status === 408) return true;
  if (
    status === 400 &&
    /target.*(?:is\s+down|accessible|firewall)/i.test(body)
  ) {
    return true;
  }
  return false;
}

/**
 * "Target is down/firewall" 400s deserve special handling: they almost always
 * mean the target itself is unreachable from the repeater, so retrying within
 * seconds just piles more probes onto an already-broken target. We treat them
 * as transient (so we still retry — the target may be a brief blip), but we
 * also signal the health monitor to verify the target so workers can pause
 * for a real recovery if the target is actually wedged.
 */
function isTargetDown400(status: number, body: string): boolean {
  return (
    status === 400 &&
    /target.*(?:is\s+down|accessible|firewall)/i.test(body)
  );
}

export interface RegisteredEntrypoint {
  endpoint: DiscoveredEndpoint;
  entrypointId: string;
}

export async function registerEntrypoints(
  api: BrightApiContext,
  projectId: string,
  endpoints: DiscoveredEndpoint[],
  baseUrl: string,
  repeaterId: string,
  authObjectId?: string,
  healthMonitor?: AppHealthMonitor,
): Promise<RegisteredEntrypoint[]> {
  // Pre-process endpoints: validate, resolve paths, build request payloads
  const prepared: {
    ep: DiscoveredEndpoint;
    method: string;
    fullUrl: string;
    payload: Record<string, unknown>;
  }[] = [];

  for (const ep of endpoints) {
    const path = resolvePath(ep.path);
    if (!isScannablePath(path)) {
      console.warn(
        `[Entrypoints] Skipping junk path: ${ep.path} (resolved: ${path})`,
      );
      continue;
    }

    let fullUrl = `${baseUrl}${path}`;
    try {
      new URL(fullUrl);
    } catch {
      console.warn(
        `[Entrypoints] Skipping malformed URL: ${fullUrl} (from path "${ep.path}")`,
      );
      continue;
    }

    const method = normalizeMethod(ep.method);

    if (ep.queryParams && ep.queryParams.length > 0) {
      const params = new URLSearchParams(
        ep.queryParams.map((p): [string, string] => [p.name, p.value]),
      );
      fullUrl += `?${params.toString()}`;
    }

    const request: Record<string, unknown> = { method, url: fullUrl };
    const needsBody = ["POST", "PUT", "PATCH"].includes(method);
    const contentType =
      ep.contentType ?? (needsBody ? "application/json" : undefined);

    if (ep.headers || contentType) {
      const headers: Record<string, string[]> = { ...(ep.headers ?? {}) };
      if (contentType && !headers["Content-Type"]) {
        headers["Content-Type"] = [contentType];
      }
      request.headers = headers;
    }

    if (needsBody) {
      request.body = sanitizeBody(ep.body ?? "{}");
    }

    const payload: Record<string, unknown> = { request, repeaterId };
    if (authObjectId) {
      payload.authObjectId = authObjectId;
    }

    prepared.push({ ep, method, fullUrl, payload });
  }

  console.log(
    `[Entrypoints] Registering ${prepared.length} endpoints (${CONCURRENCY} concurrent)…`,
  );

  const apiUrl = `https://${api.brightHostname}/api/v2/projects/${encodeURIComponent(projectId)}/entry-points`;

  // Shared state for concurrent workers
  const registered: RegisteredEntrypoint[] = [];
  let failedUploads = 0;
  let rateLimitPauseUntil = 0;

  async function postOnce(payload: Record<string, unknown>): Promise<Response> {
    return fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${api.brightToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  async function processOne(item: (typeof prepared)[number]): Promise<void> {
    const { ep, method, fullUrl, payload } = item;

    // Honor rate-limit pause
    const now = Date.now();
    if (rateLimitPauseUntil > now) {
      await sleep(rateLimitPauseUntil - now);
    }

    // Block if the app is unhealthy — a recovery may be in progress.
    if (healthMonitor) {
      await healthMonitor.waitHealthy();
    }

    console.log(
      `[Entrypoints] Adding ${method} ${fullUrl}` +
        (authObjectId ? ` [auth: ${authObjectId}]` : " [no auth]"),
    );

    // Small jitter to desynchronise concurrent workers and avoid bursts
    // saturating Bright's API/repeater pipeline.
    await sleep(Math.floor(Math.random() * JITTER_MS));

    let attempt = 0;
    while (true) {
      try {
        const res = await postOnce(payload);

        if (res.status === 429) {
          console.warn(`[Entrypoints] Rate limited (429) — pausing 10s`);
          rateLimitPauseUntil = Date.now() + 10_000;
          await sleep(10_000);
          if (attempt < MAX_RETRIES) {
            attempt++;
            continue;
          }
          await handleResponse(res, ep, method, fullUrl);
          return;
        }

        if (!res.ok && attempt < MAX_RETRIES) {
          // Peek body to detect transient Bright/repeater errors without
          // consuming the stream needed by handleResponse — clone first.
          const probe = res.clone();
          const body = await probe.text().catch(() => "");
          if (isTransientHttpError(res.status, body)) {
            // If Bright says the target is down, ask the monitor to verify
            // the app health right now. If it's actually wedged, the monitor
            // will mark the app unhealthy and our next iteration's
            // waitHealthy() will block until recovery completes.
            if (healthMonitor && isTargetDown400(res.status, body)) {
              healthMonitor.signalProbableUnhealthy(
                `target-down 400 for ${method} ${fullUrl}`,
              );
              // Block before retrying so we don't pile more failed probes
              // onto a wedged target.
              await healthMonitor.waitHealthy();
            }
            const backoff =
              BASE_BACKOFF_MS * Math.pow(3, attempt) +
              Math.floor(Math.random() * JITTER_MS);
            console.warn(
              `[Entrypoints] Transient HTTP ${res.status} for ${method} ${fullUrl} — retry ${attempt + 1}/${MAX_RETRIES} in ${backoff}ms`,
            );
            await sleep(backoff);
            attempt++;
            continue;
          }
        }

        await handleResponse(res, ep, method, fullUrl);
        return;
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          const backoff =
            BASE_BACKOFF_MS * Math.pow(3, attempt) +
            Math.floor(Math.random() * JITTER_MS);
          console.warn(
            `[Entrypoints] Network error for ${method} ${fullUrl}: ${toErrorMessage(err)} — retry ${attempt + 1}/${MAX_RETRIES} in ${backoff}ms`,
          );
          await sleep(backoff);
          attempt++;
          continue;
        }
        console.error(
          `[Entrypoints] Failed ${method} ${fullUrl}: ${toErrorMessage(err)}`,
        );
        return;
      }
    }
  }

  async function handleResponse(
    res: Response,
    ep: DiscoveredEndpoint,
    method: string,
    fullUrl: string,
  ): Promise<void> {
    if (res.ok) {
      try {
        const data = (await res.json()) as Record<string, unknown>;
        const epId = (data.id ?? data.entrypointId) as string | undefined;
        if (epId) {
          registered.push({ endpoint: ep, entrypointId: epId });
          return;
        }
      } catch {
        // Fall through to failure handling
      }
      // 2xx but no ID — count as success without tracking
      console.warn(
        `[Entrypoints] OK response for ${method} ${fullUrl} but no entrypoint ID returned`,
      );
      return;
    }

    // Parse error body for diagnostics
    let errorBody = "";
    try {
      errorBody = await res.text();
    } catch {
      // ignore
    }

    if (res.status === 409) {
      console.log(
        `[Entrypoints] EP already exists for ${method} ${fullUrl} — skipping`,
      );
    } else {
      failedUploads++;
      console.error(
        `[Entrypoints] Failed ${method} ${fullUrl}: HTTP ${res.status} — ${errorBody.slice(0, 300)}`,
      );
    }
  }

  // Run with concurrency control
  await pMap(prepared, processOne, CONCURRENCY);

  console.log(
    `[Entrypoints] Registered ${registered.length}/${endpoints.length} entrypoints` +
      (failedUploads > 0 ? ` (${failedUploads} rejected by API)` : ""),
  );
  return registered;
}

/**
 * Execute async tasks with a concurrency limit.
 * Workers pull from a shared index — keeps the pipeline saturated.
 */
async function pMap<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  let idx = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (idx < items.length) {
        const i = idx++;
        await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolvePath(path: string): string {
  let resolved = path
    .replace(/:(\w+)/g, "1")
    .replace(/\{(\w+)\}/g, "1")
    // Ruby interpolation: #{...}
    .replace(/#\{[^}]*\}/g, "placeholder")
    // Broken Ruby interpolation leftovers: #word (LLM outputs like #1, #u from #{root_path})
    .replace(/#\w+/g, "placeholder")
    // JS/TS template literals: ${...}
    .replace(/\$\{[^}]*\}/g, "placeholder")
    // ERB tags: <%= ... %>
    .replace(/<%[=-]?\s*[^%]*%>/g, "placeholder");
  // Ensure path starts with / so URL concatenation doesn't break
  if (resolved && !resolved.startsWith("/")) {
    resolved = "/" + resolved;
  }
  return resolved;
}

/**
 * Patterns that indicate the URL is not a real, scannable endpoint.
 * These come from LLM hallucinations or raw source code extraction.
 */
const JUNK_URL_PATTERNS = [
  /[#$]?\{/, // leftover template interpolation
  /#/, // URL fragment — never sent to server; indicates client-side route or broken interpolation
  /<%/, // ERB tags
  /\(\d+\)/, // Rails route constraint like (42)
  /\s/, // whitespace in path
  /placeholder/, // unresolved interpolation that resolvePath couldn't handle
];

/**
 * Return true if the path looks like a real, scannable endpoint.
 * Filters out template interpolation leftovers and other junk.
 */
function isScannablePath(path: string): boolean {
  return !JUNK_URL_PATTERNS.some((re) => re.test(path));
}

/**
 * After registering entrypoints with auth, fetch one back via the REST API
 * and log the response to verify if auth is working.
 */
export async function verifyEntrypointAuth(
  api: BrightApiContext,
  projectId: string,
  entrypointId: string,
): Promise<{ ok: boolean; detail: string }> {
  try {
    console.log(
      `[Entrypoints] Verifying auth on entrypoint ${entrypointId}...`,
    );
    const url = `https://${api.brightHostname}/api/v2/projects/${encodeURIComponent(projectId)}/entry-points/${encodeURIComponent(entrypointId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Api-Key ${api.brightToken}` },
    });
    const raw = await res.text();
    console.log(`[Entrypoints] getEntrypoint response (HTTP ${res.status}): ${raw.slice(0, 1000)}`);

    if (!res.ok) {
      return { ok: false, detail: `HTTP ${res.status}: ${raw.slice(0, 200)}` };
    }

    const data = JSON.parse(raw);
    const status = data.response?.status ?? data.status;
    if (status && (status === 401 || status === 403)) {
      return {
        ok: false,
        detail: `Entrypoint returned HTTP ${status} — auth likely not working`,
      };
    }
    return {
      ok: true,
      detail: `Entrypoint response: ${JSON.stringify(data.response ?? {}).slice(0, 300)}`,
    };
  } catch (err) {
    const msg = toErrorMessage(err);
    console.warn(`[Entrypoints] Failed to verify entrypoint auth: ${msg}`);
    return { ok: false, detail: `Could not verify: ${msg}` };
  }
}

/**
 * Check each registered entrypoint's response status and remove dead targets.
 * Full app scans only prune 404s; harness scans can opt into pruning any
 * failed baseline response because harness endpoints were already probed
 * healthy before registration.
 */
export async function pruneDeadEntrypoints(
  api: BrightApiContext,
  projectId: string,
  entries: RegisteredEntrypoint[],
  opts: { pruneFailedResponses?: boolean } = {},
): Promise<RegisteredEntrypoint[]> {
  const alive: RegisteredEntrypoint[] = [];
  const dead: string[] = [];

  console.log(
    `[Entrypoints] Checking ${entries.length} entrypoints for 404s (${CONCURRENCY} concurrent)…`,
  );

  const baseUrl = `https://${api.brightHostname}/api/v2/projects/${encodeURIComponent(projectId)}/entry-points`;

  // Check all entrypoints concurrently
  await pMap(
    entries,
    async (entry) => {
      try {
        const res = await fetch(
          `${baseUrl}/${encodeURIComponent(entry.entrypointId)}`,
          { headers: { Authorization: `Api-Key ${api.brightToken}` } },
        );
        if (!res.ok) {
          alive.push(entry);
          return;
        }
        const data = (await res.json()) as Record<string, unknown>;
        const resp = data.response as Record<string, unknown> | undefined;
        const status = resp?.status ?? data.status;

        const numericStatus = typeof status === "number" ? status : undefined;
        const shouldPrune =
          numericStatus === 404 ||
          (opts.pruneFailedResponses &&
            numericStatus !== undefined &&
            numericStatus >= 400);

        if (shouldPrune) {
          const req = data.request as Record<string, unknown> | undefined;
          const url = (req?.url ?? data.url ?? entry.entrypointId) as string;
          console.log(
            `[Entrypoints] ✗ Removing failed baseline entrypoint (HTTP ${numericStatus}): ${url}`,
          );
          dead.push(entry.entrypointId);
        } else {
          alive.push(entry);
        }
      } catch {
        // If we can't check it, keep it — don't drop potentially valid EPs
        alive.push(entry);
      }
    },
    CONCURRENCY,
  );

  // Delete dead entrypoints sequentially with rate-limit handling
  if (dead.length > 0) {
    await deleteEntrypoints(api, projectId, dead);
    console.log(
      `[Entrypoints] Pruned ${dead.length} dead entrypoint(s), ${alive.length} remaining`,
    );
  }

  return alive;
}

const DELETE_MAX_RETRIES = 3;
const DELETE_BACKOFF_MS = 2_000;

/**
 * Bulk-delete entrypoints in a single API call.
 * `DELETE /api/v2/projects/{projectId}/entry-points` with JSON body `{ ids: [...] }`.
 * Retries with exponential back-off on 429.
 */
async function deleteEntrypoints(
  api: BrightApiContext,
  projectId: string,
  ids: string[],
): Promise<void> {
  const url = `https://${api.brightHostname}/api/v2/projects/${encodeURIComponent(projectId)}/entry-points`;

  for (let attempt = 0; attempt <= DELETE_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Api-Key ${api.brightToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids }),
      });

      if (res.ok || res.status === 204) {
        return;
      }

      if (res.status === 429) {
        if (attempt >= DELETE_MAX_RETRIES) {
          console.warn(
            `[Entrypoints] Bulk delete rate-limited after ${DELETE_MAX_RETRIES} retries`,
          );
          return;
        }
        const backoff = DELETE_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(
          `[Entrypoints] Rate limited (429) on bulk delete — retry ${attempt + 1}/${DELETE_MAX_RETRIES} in ${(backoff / 1000).toFixed(0)}s`,
        );
        await sleep(backoff);
        continue;
      }

      console.warn(
        `[Entrypoints] Bulk delete failed: ${res.status} ${res.statusText}`,
      );
      return;
    } catch (err) {
      console.warn(`[Entrypoints] Bulk delete error: ${err}`);
      return;
    }
  }
}

/**
 * Ensure the body string is valid, compact JSON.
 * The LLM sometimes generates multi-line JSON (especially for GraphQL queries)
 * with literal newlines inside string values, which breaks JSON parsing on the
 * receiving end ("Unexpected token \\n in JSON at position …").
 */
function sanitizeBody(body: unknown): string {
  if (typeof body !== "string") {
    // LLM sometimes returns body as an object instead of a JSON string
    return body ? JSON.stringify(body) : "{}";
  }
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

const VALID_HTTP_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "CONNECT",
  "OPTIONS",
  "TRACE",
  "PATCH",
]);

/**
 * Normalize non-standard method names (e.g. GRAPHQL_QUERY, GRAPHQL_MUTATION)
 * into valid HTTP methods that the Bright API accepts.
 */
function normalizeMethod(method: string): string {
  const upper = method.toUpperCase();
  if (VALID_HTTP_METHODS.has(upper)) return upper;

  // GraphQL operations are always POST
  if (upper.startsWith("GRAPHQL")) return "POST";

  // Fallback: default to GET for unknown values
  console.warn(`[Entrypoints] Unknown method "${method}", defaulting to GET`);
  return "GET";
}
