import type { DiscoveredEndpoint, BrightApiContext } from "../types.js";
import type { AppHealthMonitor } from "../app-health.js";
import { toErrorMessage } from "../utils.js";

const CONCURRENCY = 3;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;
const JITTER_MS = 250;
const RESOLVE_CONCURRENCY = 5;
const RESOLVE_TIMEOUT = 8_000;

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
      // Binary content types (gRPC-Web) pass body as-is — raw binary string
      const isBinary = contentType && contentType.includes("grpc-web");
      request.body = isBinary ? (ep.body ?? "") : sanitizeBody(ep.body ?? "{}");
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
      // The Bright API returns a `location` header with the existing entrypoint path:
      // /api/v2/projects/{projectId}/entry-points/{entrypointId}
      const location = res.headers.get("location") ?? "";
      const existingId = location.split("/").pop();
      if (existingId) {
        registered.push({ endpoint: ep, entrypointId: existingId });
        console.log(
          `[Entrypoints] EP already exists for ${method} ${fullUrl} — reusing ${existingId}`,
        );
      } else {
        console.log(
          `[Entrypoints] EP already exists for ${method} ${fullUrl} — no location header`,
        );
      }
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

// ---------------------------------------------------------------------------
// Path param resolution — probe the app to replace hallucinated IDs with real ones
// ---------------------------------------------------------------------------

/** Pattern matching segments that look like resource IDs (hallucinated by the LLM) */
const ID_SEGMENT_PATTERN = /^(?:\d+|[0-9a-f]{8,}|[0-9a-f-]{36}|[a-z]{1,4}_[a-z0-9]{6,}|[a-z0-9]{20,}|book_\w+|bk_\w+|usr_\w+|evt_\w+|cal_\w+|wh_\w+|org_\w+|team_\w+)$/i;

/**
 * Detect whether a path segment is likely a resource ID (numeric, UUID, prefixed slug, etc.)
 */
function isIdSegment(segment: string): boolean {
  return ID_SEGMENT_PATTERN.test(segment);
}

/**
 * For a path like /v2/bookings/bk_123/recordings, find the "list parent":
 * /v2/bookings (the first ancestor where the next segment is an ID).
 * Returns { listPath, idIndex } or null if no ID segment found.
 */
function findListParent(path: string): { listPath: string; idIndex: number; segments: string[] } | null {
  const segments = path.split("/").filter(Boolean);
  for (let i = 0; i < segments.length; i++) {
    if (isIdSegment(segments[i])) {
      const listPath = "/" + segments.slice(0, i).join("/");
      return { listPath, idIndex: i, segments };
    }
  }
  return null;
}

/**
 * Try to extract a real resource ID from a list endpoint response.
 * Handles common patterns: JSON array, {data: [...]}, {items: [...]}, {results: [...]}
 */
function extractIdFromListResponse(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    let items: unknown[] | null = null;

    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed && typeof parsed === "object") {
      // Common wrapper patterns
      items = parsed.data ?? parsed.items ?? parsed.results ?? parsed.content ?? parsed.entries ?? parsed.records;
      if (!Array.isArray(items)) {
        // Maybe the response itself is a single object with an id
        const id = parsed.id ?? parsed._id ?? parsed.uid ?? parsed.slug;
        if (id) return String(id);
        items = null;
      }
    }

    if (items && items.length > 0) {
      const first = items[0] as Record<string, unknown>;
      if (first && typeof first === "object") {
        const id = first.id ?? first._id ?? first.uid ?? first.slug ?? first.bookingId ?? first.eventTypeId;
        if (id) return String(id);
      }
    }
  } catch {
    // Not JSON or unparseable
  }
  return null;
}

/** Common route prefixes that NestJS/Express apps mount under */
const CANDIDATE_PREFIXES = ["/v2", "/api/v2", "/api/v1", "/api", "/v1"];

/**
 * Detect if discovered endpoints are missing a route prefix.
 * Tests a sample of endpoints — if they 404 without prefix but succeed with one, returns that prefix.
 */
async function detectRoutePrefix(
  endpoints: DiscoveredEndpoint[],
  baseUrl: string,
  authHeaders?: Record<string, string>,
): Promise<string | null> {
  // Find endpoints that look like they might need a prefix:
  // paths that don't already start with /api or /v{N}
  const candidates = endpoints.filter(
    (ep) => ep.path !== "/" && ep.path !== "/health" && !/^\/(?:api|v\d)\//.test(ep.path),
  );
  if (candidates.length === 0) return null;

  // Take a few sample endpoints with common resource-like paths
  const samplePaths = candidates
    .map((ep) => ep.path.split("?")[0]) // strip query
    .filter((p) => p.split("/").length >= 2) // at least /resource or /resource/id
    .slice(0, 5);

  if (samplePaths.length === 0) return null;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(authHeaders ?? {}),
  };

  // For each candidate prefix, count how many sample paths return non-404
  for (const prefix of CANDIDATE_PREFIXES) {
    let hits = 0;
    let misses = 0;

    await pMap(
      samplePaths.slice(0, 3),
      async (path) => {
        try {
          // First check if it already works without prefix
          const directRes = await fetch(`${baseUrl}${path}`, {
            method: "HEAD",
            headers,
            signal: AbortSignal.timeout(5000),
          });
          if (directRes.ok || (directRes.status !== 404 && directRes.status !== 405)) {
            // Already works without prefix — no prefix needed
            misses++;
            return;
          }

          // Try with prefix
          const prefixedRes = await fetch(`${baseUrl}${prefix}${path}`, {
            method: "HEAD",
            headers,
            signal: AbortSignal.timeout(5000),
          });
          if (prefixedRes.ok || (prefixedRes.status !== 404 && prefixedRes.status !== 405)) {
            hits++;
          } else {
            misses++;
          }
        } catch {
          misses++;
        }
      },
      3,
    );

    if (hits >= 2 && hits > misses) {
      return prefix;
    }
  }

  return null;
}

/**
 * Probe list endpoints on the running app to resolve real resource IDs.
 * Replaces hallucinated ID segments in endpoint paths with actual IDs from the app.
 *
 * Strategy: group endpoints by their "list parent" path, probe each list endpoint once,
 * then substitute the real ID into all endpoints that share that parent.
 */
export async function resolvePathParams(
  endpoints: DiscoveredEndpoint[],
  baseUrl: string,
  authHeaders?: Record<string, string>,
): Promise<DiscoveredEndpoint[]> {
  // --- Step 0: Detect missing route prefix ---
  // If the LLM discovered endpoints from controller files without the module
  // prefix (e.g. /bookings/:id instead of /v2/bookings/:id), detect and fix.
  const detectedPrefix = await detectRoutePrefix(endpoints, baseUrl, authHeaders);
  let prefixedEndpoints = endpoints;
  if (detectedPrefix) {
    console.log(`[Entrypoints] Detected missing route prefix: "${detectedPrefix}" — applying to ${endpoints.length} endpoints`);
    prefixedEndpoints = endpoints.map((ep) => {
      // Don't double-prefix paths that already have it
      if (ep.path.startsWith(detectedPrefix)) return ep;
      // Don't prefix paths that already start with /api/ or /v2/ (likely already correct)
      if (/^\/(?:api|v\d)\//.test(ep.path)) return ep;
      // Don't prefix the root or health paths
      if (ep.path === "/" || ep.path === "/health") return ep;
      return { ...ep, path: `${detectedPrefix}${ep.path}` };
    });
  }

  // --- Step 1: Group endpoints by their list parent path ---
  const parentMap = new Map<string, { idIndex: number; endpoints: DiscoveredEndpoint[] }>();
  const noParent: DiscoveredEndpoint[] = [];

  for (const ep of prefixedEndpoints) {
    const info = findListParent(ep.path);
    if (!info) {
      noParent.push(ep);
      continue;
    }
    const key = info.listPath;
    if (!parentMap.has(key)) {
      parentMap.set(key, { idIndex: info.idIndex, endpoints: [] });
    }
    parentMap.get(key)!.endpoints.push(ep);
  }

  if (parentMap.size === 0) {
    return prefixedEndpoints; // No path params to resolve
  }

  console.log(
    `[Entrypoints] Resolving path params: ${parentMap.size} list endpoint(s) to probe for real IDs`,
  );

  // --- Step 2: Probe each list parent to get a real ID ---
  const resolvedIds = new Map<string, string>();

  const listPaths = [...parentMap.keys()];
  await pMap(
    listPaths,
    async (listPath) => {
      try {
        const url = `${baseUrl}${listPath}`;
        const headers: Record<string, string> = {
          Accept: "application/json",
          ...(authHeaders ?? {}),
        };
        const res = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(RESOLVE_TIMEOUT),
        });
        if (!res.ok) {
          return;
        }
        const body = await res.text();
        const realId = extractIdFromListResponse(body);
        if (realId) {
          resolvedIds.set(listPath, realId);
          console.log(`[Entrypoints] ✓ Resolved ${listPath} → id="${realId}"`);
        }
      } catch {
        // Timeout or network error — skip this list path
      }
    },
    RESOLVE_CONCURRENCY,
  );

  console.log(
    `[Entrypoints] Resolved ${resolvedIds.size}/${parentMap.size} list parent(s) with real IDs`,
  );

  // Rebuild endpoints with real IDs substituted
  const result: DiscoveredEndpoint[] = [...noParent];

  for (const [listPath, group] of parentMap) {
    const realId = resolvedIds.get(listPath);
    if (!realId) {
      // Couldn't resolve — keep original (will likely 404 and get pruned)
      result.push(...group.endpoints);
      continue;
    }

    for (const ep of group.endpoints) {
      const segments = ep.path.split("/").filter(Boolean);
      // Replace the first ID segment (at idIndex) with the real ID
      if (group.idIndex < segments.length && isIdSegment(segments[group.idIndex])) {
        segments[group.idIndex] = realId;
      }
      const newPath = "/" + segments.join("/");
      result.push({ ...ep, path: newPath });
    }
  }

  return result;
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
          const method = String(
            req?.method ?? entry.endpoint.method ?? "GET",
          ).toUpperCase();
          console.log(
            `[Entrypoints] ✗ Removing failed baseline entrypoint (HTTP ${numericStatus}): ${method} ${url}`,
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
 * Bulk-delete entrypoints via the API. Batches in chunks of 50 to avoid
 * payload-size 400 errors from the Bright API.
 * `DELETE /api/v2/projects/{projectId}/entry-points` with JSON body `{ ids: [...] }`.
 * Retries with exponential back-off on 429.
 */
async function deleteEntrypoints(
  api: BrightApiContext,
  projectId: string,
  ids: string[],
): Promise<void> {
  const BATCH_SIZE = 50;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    await deleteEntrypointBatch(api, projectId, batch);
  }
}

async function deleteEntrypointBatch(
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
export function sanitizeBody(body: unknown): string {
  if (typeof body !== "string") {
    // LLM sometimes returns body as an object instead of a JSON string
    return body ? JSON.stringify(body) : "{}";
  }
  if (!body.trim()) return "{}";
  try {
    // Parse and re-serialize → collapses formatting and properly escapes
    // any characters that need escaping inside string values.
    const parsed = JSON.parse(body);
    return JSON.stringify(parsed);
  } catch {
    // Attempt repair: common LLM mistake is unescaped quotes in nested JSON strings
    const repaired = repairJsonBody(body);
    if (repaired) return repaired;
    // Last resort: compact whitespace
    return body.replace(/\n\s*/g, " ").trim();
  }
}

/**
 * Attempt to repair invalid JSON bodies from LLM hallucinations.
 * Common issues:
 * - Unescaped double quotes inside string values (nested JSON templates)
 * - Trailing commas before closing braces/brackets
 */
function repairJsonBody(body: string): string | null {
  let s = body.replace(/\n\s*/g, " ").trim();

  // Fix 1: Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, "$1");

  // Quick check — maybe trailing commas was the only issue
  try {
    return JSON.stringify(JSON.parse(s));
  } catch {
    // continue with more aggressive repairs
  }

  // Fix 2: Detect and fix unescaped quotes in string values that contain nested JSON.
  // Strategy: find string values that start with { or [ (nested JSON) and escape their contents.
  try {
    const fixed = fixNestedJsonStrings(s);
    if (fixed !== s) {
      const parsed = JSON.parse(fixed);
      return JSON.stringify(parsed);
    }
  } catch {
    // continue
  }

  // Fix 3: Brute-force — attempt progressive quote-escaping guided by parse errors
  try {
    const fixed = fixByParseError(s);
    if (fixed) {
      const parsed = JSON.parse(fixed);
      return JSON.stringify(parsed);
    }
  } catch {
    // couldn't repair
  }

  return null;
}

/**
 * Find string values that contain unescaped nested JSON (start with { or [)
 * and properly escape the inner content.
 *
 * Pattern: ":"{ ... }"  where the inner braces contain unescaped quotes.
 * We use bracket depth to find where the nested JSON ends, then escape that region.
 */
function fixNestedJsonStrings(s: string): string {
  // Match pattern: "key":"{ or "key":"[  where the value starts with a brace
  // We need to find these regions and escape quotes within them
  const result: string[] = [];
  let i = 0;

  while (i < s.length) {
    // Look for :"{ or :"[ pattern (string value starting with nested JSON)
    if (s[i] === ":" && s[i + 1] === '"' && (s[i + 2] === "{" || s[i + 2] === "[")) {
      result.push(":", '"');
      i += 2; // skip :"
      // Now we're inside a string value that contains nested JSON
      // Find the matching close bracket, tracking depth
      const openBracket = s[i];
      const closeBracket = openBracket === "{" ? "}" : "]";
      let depth = 0;
      let innerStart = i;
      let j = i;

      // Walk to find where the nested JSON value ends
      while (j < s.length) {
        if (s[j] === openBracket) depth++;
        else if (s[j] === closeBracket) {
          depth--;
          if (depth === 0) {
            // j is at the closing bracket. Check if next char is " (closing the string)
            if (s[j + 1] === '"') {
              // Extract the inner content between i and j+1 (inclusive of closing bracket)
              const inner = s.slice(innerStart, j + 1);
              // Escape all quotes inside
              result.push(inner.replace(/"/g, '\\"'));
              result.push('"'); // closing quote of the string value
              i = j + 2;
              break;
            }
          }
        }
        j++;
      }

      if (depth !== 0 || j >= s.length) {
        // Couldn't find matching bracket — just copy the char and move on
        result.push(s[innerStart]);
        i = innerStart + 1;
      }
    } else {
      result.push(s[i]);
      i++;
    }
  }

  return result.join("");
}

/**
 * Attempt to fix JSON by finding parse error positions and escaping quotes there.
 * Tries up to 20 iterations of: parse → find error position → escape the quote at that position.
 */
function fixByParseError(s: string): string | null {
  let current = s;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      JSON.parse(current);
      return current; // Success!
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      // Extract position from "at position N"
      const posMatch = msg.match(/at position (\d+)/);
      if (!posMatch) return null;
      const pos = parseInt(posMatch[1], 10);
      if (pos <= 0 || pos >= current.length) return null;

      // Find the offending quote near this position and escape it
      // Look backwards from pos for an unescaped quote
      let quotePos = -1;
      for (let k = pos; k >= Math.max(0, pos - 5); k--) {
        if (current[k] === '"' && current[k - 1] !== "\\") {
          quotePos = k;
          break;
        }
      }
      if (quotePos === -1) return null;

      // Escape the quote
      current = current.slice(0, quotePos) + '\\"' + current.slice(quotePos + 1);
    }
  }
  return null;
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
