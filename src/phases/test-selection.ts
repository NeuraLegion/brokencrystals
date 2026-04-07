import type OpenAI from "openai";
import type { DiscoveredEndpoint, TechStack } from "../types.js";
import type { BrightMcpClient, BrightTest } from "../mcp-client.js";
import { chatWithSchema } from "../inference.js";
import { formatTechStack } from "../utils.js";

// Tests that require multiple auth objects configured at the scan level
const AUTH_DEPENDENT_TESTS = new Set([
  "broken_access_control",
  "bola",
  "bopla",
  "brute_force_login",
  "excessive_data_exposure",
  "mass_assignment",
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
): Promise<ScanGroup[]> {
  const availableTests = await bright.listTests();

  const eligibleTests = hasAuth
    ? availableTests
    : availableTests.filter((t) => !AUTH_DEPENDENT_TESTS.has(t.tag));

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
- Always include header_security and cookie_security for all endpoints

Be selective — irrelevant tests waste scan time.`,
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
    return valid.length > 0 ? valid : ["header_security", "cookie_security"].filter((t) => validTags.has(t));
  });

  const PATH_PARAM_RE = /[:{}]/;

  // Group endpoints that share the exact same test set
  const groupMap = new Map<string, { epIds: string[]; hasPathParams: boolean }>();
  for (let i = 0; i < endpoints.length; i++) {
    if (i >= entrypointIds.length) break;
    const key = [...perEndpoint[i]].sort().join(",");
    if (!groupMap.has(key)) groupMap.set(key, { epIds: [], hasPathParams: false });
    const g = groupMap.get(key)!;
    g.epIds.push(entrypointIds[i]);
    if (PATH_PARAM_RE.test(endpoints[i].path)) g.hasPathParams = true;
  }

  const groups: ScanGroup[] = [];
  for (const [testsKey, { epIds, hasPathParams }] of groupMap) {
    groups.push({ tests: testsKey.split(","), entrypointIds: epIds, hasPathParams });
  }

  // Cap the number of scan groups to avoid excessive parallel scans
  const MAX_GROUPS = 10;
  const consolidated = consolidateGroups(groups, MAX_GROUPS);

  console.log(`[Tests] Created ${consolidated.length} scan group(s) from ${endpoints.length} endpoints`);
  for (const [i, g] of consolidated.entries()) {
    console.log(`[Tests]   Group ${i + 1}: ${g.entrypointIds.length} endpoints, ${g.tests.length} tests`);
  }

  return consolidated;
}

/**
 * If there are more groups than maxGroups, merge the smallest groups
 * (by entrypoint count) into larger ones by taking the union of their tests.
 */
function consolidateGroups(groups: ScanGroup[], maxGroups: number): ScanGroup[] {
  if (groups.length <= maxGroups) return groups;

  // Sort by entrypoint count ascending — merge smallest first
  const sorted = [...groups].sort((a, b) => a.entrypointIds.length - b.entrypointIds.length);

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
    const insertIdx = sorted.findIndex((g) => g.entrypointIds.length >= merged.entrypointIds.length);
    if (insertIdx === -1) sorted.push(merged);
    else sorted.splice(insertIdx, 0, merged);
  }

  return sorted;
}
