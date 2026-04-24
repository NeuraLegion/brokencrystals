import type { BrightApiContext } from "./types.js";
import { toErrorMessage } from "./utils.js";

// ---------------------------------------------------------------------------
// Bright REST domain types (only the fields we actually consume)
// ---------------------------------------------------------------------------

export interface BrightTest {
  tag: string;
  name: string;
  description?: string;
  group?: string;
  buckets?: string[];
  deprecated?: boolean;
  enabled?: boolean;
}

export interface BrightAuth {
  id: string;
  name: string;
  type: string;
  projectId?: string;
}

// ---------------------------------------------------------------------------
// Low-level fetch helper
// ---------------------------------------------------------------------------

async function brightGet<T>(
  api: BrightApiContext,
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(path, `https://${api.brightHostname}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Api-Key ${api.brightToken}`,
        Accept: "application/json",
      },
    });
  } catch (err) {
    throw new Error(`Bright API request failed (${path}): ${toErrorMessage(err)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Bright API ${path} returned HTTP ${res.status}: ${body.slice(0, 500)}`,
    );
  }
  return (await res.json()) as T;
}

function unwrapList<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "items" in result) {
    return (result as { items: T[] }).items;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function listTests(api: BrightApiContext): Promise<BrightTest[]> {
  const data = await brightGet<unknown>(api, "/api/v1/scans/tests");
  return unwrapList<BrightTest>(data);
}

export async function listAuthObjects(
  api: BrightApiContext,
  opts: { projectId?: string; q?: string; limit?: number } = {},
): Promise<BrightAuth[]> {
  const data = await brightGet<unknown>(api, "/api/v3/auth-objects", {
    projectId: opts.projectId,
    q: opts.q,
    limit: opts.limit,
  });
  return unwrapList<BrightAuth>(data);
}

export async function getAuthObject(
  api: BrightApiContext,
  authObjectId: string,
): Promise<unknown> {
  return brightGet<unknown>(
    api,
    `/api/v3/auth-objects/${encodeURIComponent(authObjectId)}`,
  );
}
