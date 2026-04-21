import type OpenAI from "openai";
import type { DiscoveredEndpoint, TechStack } from "../types.js";
import type { BrightMcpClient, BrightTest } from "../mcp-client.js";
import { chatWithSchema } from "../inference.js";
import { formatTechStack } from "../utils.js";

// Tests that require multiple auth objects (different user roles) at the scan level.
const MULTI_AUTH_TESTS = new Set(["broken_access_control"]);

// Tests that are mutually exclusive with other tests and must run alone,
// or are destructive / counterproductive for automated scanning,
// or produce low-severity findings (cookie/header config) not worth scanning.
const EXCLUDED_TESTS = new Set([
  "lrrl",
  "header_security",
  "cookie_security",
]);

export interface ScanGroup {
  tests: string[];
  entrypointIds: string[];
  hasPathParams: boolean;
}

/**
 * Select relevant security tests per endpoint, then group endpoints
 * that share the same test set into scan groups for efficient scanning.
 */
export async function selectTestsPerEndpoint(
  llm: OpenAI,
  bright: BrightMcpClient,
  endpoints: DiscoveredEndpoint[],
  entrypointIds: string[],
  techStack: TechStack,
  hasAuth: boolean,
  model?: string,
): Promise<ScanGroup[]> {
  const availableTests = await bright.listTests();

  const eligibleTests = availableTests.filter(
    (t) => !MULTI_AUTH_TESTS.has(t.tag) && !EXCLUDED_TESTS.has(t.tag),
  );

  const stackStr = formatTechStack(techStack);
  const testCatalog = eligibleTests
    .map((t) => `- ${t.tag}: ${t.name}`)
    .join("\n");

  const endpointList = endpoints
    .map((ep, i) => `[${i}] ${ep.method} ${ep.path} (${ep.filePath})`)
    .join("\n");

  const messages: Parameters<typeof chatWithSchema>[1] = [
    {
      role: "system",
      content: `You are a DAST security expert selecting which vulnerability tests to run against each endpoint of a ${stackStr} application.

For EACH endpoint, select ONLY tests that are relevant to it. Consider:
- HTTP method: GET endpoints are less likely to have SQLi/body-based attacks
- Path patterns: /auth/ endpoints are relevant for JWT/session tests, /upload for file_upload, etc.
- Technology: skip WordPress/GraphQL tests for non-matching tech
- Parameters: endpoints with query params → XSS, SSRF; with body → SQLi, XSS, SSTI
- Be selective — irrelevant tests waste scan time.
- Do NOT include header_security or cookie_security — they produce low-severity findings and are excluded.`,
    },
    {
      role: "user",
      content: `For each endpoint (by index), select relevant security tests.

Endpoints:
${endpointList}

Available tests (use ONLY these exact tags):
${testCatalog}

Return a JSON object with an array of entries, one per endpoint index.`,
    },
  ];

  const result = await chatWithSchema<{
    entries: Array<{ index: number; tests: string[] }>;
  }>(
    llm,
    messages,
    "per_endpoint_tests",
    {
      type: "object",
      properties: {
        entries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              index: { type: "number" },
              tests: { type: "array", items: { type: "string" } },
            },
            required: ["index", "tests"],
            additionalProperties: false,
          },
        },
      },
      required: ["entries"],
      additionalProperties: false,
    },
    model,
  );

  // Build a lookup from index → tests
  const indexToTests = new Map<number, string[]>();
  for (const entry of result.entries) {
    indexToTests.set(entry.index, entry.tests);
  }

  // Validate and build per-endpoint test lists
  const validTags = new Set(eligibleTests.map((t) => t.tag));
  const perEndpoint: string[][] = endpoints.map((_, i) => {
    const raw = indexToTests.get(i) ?? [];
    const valid = raw.filter((t) => validTags.has(t));
    return valid.length > 0
      ? valid
      : [];
  });

  const PATH_PARAM_RE = /[:{}]/;

  // Group endpoints that share the exact same test set
  const groupMap = new Map<
    string,
    { epIds: string[]; hasPathParams: boolean }
  >();
  for (let i = 0; i < endpoints.length; i++) {
    if (i >= entrypointIds.length) break;
    const key = [...perEndpoint[i]].sort().join(",");
    if (!groupMap.has(key))
      groupMap.set(key, { epIds: [], hasPathParams: false });
    const g = groupMap.get(key)!;
    g.epIds.push(entrypointIds[i]);
    if (PATH_PARAM_RE.test(endpoints[i].path)) g.hasPathParams = true;
  }

  const groups: ScanGroup[] = [];
  for (const [testsKey, { epIds, hasPathParams }] of groupMap) {
    const tests = testsKey ? testsKey.split(",") : [];
    if (tests.length === 0) continue; // Skip endpoints with no selected tests
    groups.push({
      tests,
      entrypointIds: epIds,
      hasPathParams,
    });
  }

  // Cap the number of scan groups to avoid excessive parallel scans
  const MAX_GROUPS = 10;
  const consolidated = consolidateGroups(groups, MAX_GROUPS);

  // Split any groups that have too many entrypoints — the Bright API
  // rejects scans with excessive entrypoints per request
  const MAX_ENTRYPOINTS_PER_GROUP = 10;
  const finalGroups = splitLargeGroups(consolidated, MAX_ENTRYPOINTS_PER_GROUP);

  console.log(
    `[Tests] Created ${finalGroups.length} scan group(s) from ${endpoints.length} endpoints`,
  );
  for (const [i, g] of finalGroups.entries()) {
    console.log(
      `[Tests]   Group ${i + 1}: ${g.entrypointIds.length} endpoints, ${g.tests.length} tests`,
    );
  }

  return finalGroups;
}

/**
 * Split any groups whose entrypoint count exceeds the limit into
 * smaller chunks, preserving the same test set for each chunk.
 */
function splitLargeGroups(groups: ScanGroup[], maxEps: number): ScanGroup[] {
  const result: ScanGroup[] = [];
  for (const g of groups) {
    if (g.entrypointIds.length <= maxEps) {
      result.push(g);
      continue;
    }
    for (let i = 0; i < g.entrypointIds.length; i += maxEps) {
      result.push({
        tests: g.tests,
        entrypointIds: g.entrypointIds.slice(i, i + maxEps),
        hasPathParams: g.hasPathParams,
      });
    }
  }
  return result;
}

/**
 * If there are more groups than maxGroups, merge the smallest groups
 * (by entrypoint count) into larger ones by taking the union of their tests.
 */
function consolidateGroups(
  groups: ScanGroup[],
  maxGroups: number,
): ScanGroup[] {
  if (groups.length <= maxGroups) return groups;

  // Sort by entrypoint count ascending — merge smallest first
  const sorted = [...groups].sort(
    (a, b) => a.entrypointIds.length - b.entrypointIds.length,
  );

  while (sorted.length > maxGroups) {
    // Take the two smallest groups and merge them
    const a = sorted.shift()!;
    const b = sorted.shift()!;
    const mergedTests = [...new Set([...a.tests, ...b.tests])];
    const merged: ScanGroup = {
      tests: mergedTests,
      entrypointIds: [...a.entrypointIds, ...b.entrypointIds],
      hasPathParams: a.hasPathParams || b.hasPathParams,
    };
    // Re-insert in sorted position
    const insertIdx = sorted.findIndex(
      (g) => g.entrypointIds.length >= merged.entrypointIds.length,
    );
    if (insertIdx === -1) sorted.push(merged);
    else sorted.splice(insertIdx, 0, merged);
  }

  return sorted;
}
