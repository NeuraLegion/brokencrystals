import type OpenAI from "openai";
import type { DiscoveredEndpoint, TechStack, BrightApiContext } from "../types.js";
import { listTests } from "../bright-api.js";
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

// ---------------------------------------------------------------------------
// Rules-based test classification
// ---------------------------------------------------------------------------

/** Tests that apply to virtually every endpoint — low cost, high value */
const UNIVERSAL_TESTS = new Set([
  "secret_tokens",
  "full_path_disclosure",
  "http_method_fuzzing",
  "version_control_systems",
  "open_cloud_storage",
]);

/** Tests that only make sense if the endpoint has injectable inputs */
const INPUT_TESTS = new Set([
  "sqli",
  "xss",
  "stored_xss",
  "ssti",
  "osi",
  "lfi",
  "rfi",
  "html_injection",
  "css_injection",
  "iframe_injection",
  "xpathi",
  "xxe",
  "ldapi",
  "nosql",
  "email_injection",
  "ssrf",
  "unvalidated_redirect",
  "server_side_js_injection",
  "proto_pollution",
  "prompt_injection",
]);

/** Endpoint has input surfaces: params, body, or query strings */
function hasInputs(ep: DiscoveredEndpoint): boolean {
  return !!(
    ep.body ||
    ep.queryParams?.length ||
    /[:{}]/.test(ep.path) ||
    ["POST", "PUT", "PATCH"].includes(ep.method.toUpperCase())
  );
}

/** Path-level heuristics for specific test tags */
const PATH_RULES: Array<{ pattern: RegExp; tests: string[] }> = [
  { pattern: /\/(login|signin|auth|session|token|oauth|saml)/i, tests: ["brute_force_login", "csrf", "broken_saml_auth", "jwt"] },
  { pattern: /\/(upload|attach|import|file)/i, tests: ["file_upload"] },
  { pattern: /\/(redirect|callback|return|next)/i, tests: ["unvalidated_redirect", "ssrf"] },
  { pattern: /\/(search|query|filter|find|lookup)/i, tests: ["sqli", "xss", "nosql"] },
  { pattern: /\/(admin|manage|settings|config|system)/i, tests: ["directory_listing", "common_files"] },
  { pattern: /\/(user|profile|account|member)/i, tests: ["id_enumeration", "bopla", "excessive_data_exposure"] },
  { pattern: /\/(api|rest|graphql|v\d)/i, tests: ["id_enumeration", "bopla", "excessive_data_exposure", "improper_asset_management"] },
  { pattern: /graphql/i, tests: ["graphql_introspection"] },
  { pattern: /\/(email|mail|contact|notify|message)/i, tests: ["email_injection"] },
  { pattern: /\/(template|render|preview|report)/i, tests: ["ssti", "xss", "stored_xss"] },
  { pattern: /\/(xml|feed|rss|soap|wsdl)/i, tests: ["xxe", "xpathi"] },
  { pattern: /\/(ldap|directory|ad)/i, tests: ["ldapi"] },
  { pattern: /\/(url|link|fetch|proxy|webhook|callback)/i, tests: ["ssrf"] },
  { pattern: /\/(command|exec|run|shell|ping|process)/i, tests: ["osi"] },
  { pattern: /\/(include|load|read|download|path|file)/i, tests: ["lfi", "rfi"] },
  { pattern: /\/(date|time|schedule|booking|reservation)/i, tests: ["date_manipulation"] },
  { pattern: /\/(price|quantity|amount|total|cart|order|checkout)/i, tests: ["business_constraint_bypass"] },
  { pattern: /\/(ai|llm|chat|prompt|generate|completion)/i, tests: ["prompt_injection", "insecure_output_handling"] },
  { pattern: /\/(s3|bucket|storage|blob|cloud)/i, tests: ["amazon_s3_takeover", "open_cloud_storage"] },
  { pattern: /wordpress|wp-/i, tests: ["wordpress", "default_login_location"] },
];

/** Tech stack → tests that should be included/excluded globally */
function techStackTests(tech: TechStack): { include: Set<string>; exclude: Set<string> } {
  const include = new Set<string>();
  const exclude = new Set<string>();
  const all = [...tech.languages, ...tech.frameworks, ...tech.databases].map(s => s.toLowerCase());
  const joined = all.join(" ");

  // DB-specific injection tests
  if (all.some(d => /postgres|mysql|mariadb|sqlite|mssql|oracle|sql/i.test(d))) {
    include.add("sqli");
  }
  if (all.some(d => /mongo|couch|dynamo|firestore|nosql/i.test(d))) {
    include.add("nosql");
  }
  if (!all.some(d => /mongo|couch|dynamo|firestore|nosql/i.test(d))) {
    exclude.add("nosql");
  }

  // Template engines → SSTI
  if (/jinja|django|twig|blade|thymeleaf|freemarker|mustache|handlebars|ejs|pug|nunjucks|erb|slim|haml/i.test(joined)) {
    include.add("ssti");
  }

  // JS ecosystem
  if (all.some(l => /javascript|typescript|node|express|next|nuxt|react|angular|vue/i.test(l))) {
    include.add("proto_pollution");
    include.add("server_side_js_injection");
    include.add("retire_js");
  } else {
    exclude.add("proto_pollution");
    exclude.add("server_side_js_injection");
    exclude.add("retire_js");
  }

  // GraphQL
  if (all.some(f => /graphql|apollo|hasura/i.test(f))) {
    include.add("graphql_introspection");
  } else {
    exclude.add("graphql_introspection");
  }

  // WordPress
  if (!all.some(f => /wordpress/i.test(f))) {
    exclude.add("wordpress");
  }

  // LDAP
  if (!all.some(d => /ldap|active.?directory|openldap/i.test(d))) {
    exclude.add("ldapi");
  }

  // XML-heavy stacks
  if (all.some(f => /java|spring|\.net|asp|soap|xml/i.test(f))) {
    include.add("xxe");
    include.add("xpathi");
  }

  // SAML only if framework suggests it
  if (!/saml|sso|okta|onelogin|shibboleth/i.test(joined)) {
    exclude.add("broken_saml_auth");
  }

  return { include, exclude };
}

/** Content-type heuristics */
function contentTypeTests(ep: DiscoveredEndpoint): string[] {
  const ct = ep.contentType?.toLowerCase() ?? "";
  const body = ep.body?.toLowerCase() ?? "";
  const tests: string[] = [];

  if (ct.includes("xml") || body.startsWith("<?xml") || body.startsWith("<soap")) {
    tests.push("xxe", "xpathi");
  }
  if (ct.includes("json") || body.startsWith("{") || body.startsWith("[")) {
    tests.push("sqli", "nosql", "bopla");
  }
  if (ct.includes("form") || ct.includes("urlencoded")) {
    tests.push("sqli", "xss", "csrf");
  }
  if (ct.includes("multipart")) {
    tests.push("file_upload");
  }
  return tests;
}

/**
 * Deterministic baseline: classify each endpoint based on method, path,
 * params, body, content-type, and tech stack. Returns a baseline test set
 * per endpoint that the LLM can then refine.
 */
function baselineTestsForEndpoint(
  ep: DiscoveredEndpoint,
  techRules: { include: Set<string>; exclude: Set<string> },
  hasAuth: boolean,
  validTags: Set<string>,
): string[] {
  const tests = new Set<string>();

  // 1. Universal tests for all endpoints
  for (const t of UNIVERSAL_TESTS) tests.add(t);

  // 2. Input-based tests if endpoint has injection surfaces
  if (hasInputs(ep)) {
    for (const t of INPUT_TESTS) tests.add(t);
  }

  // 3. Path-based rules
  for (const rule of PATH_RULES) {
    if (rule.pattern.test(ep.path)) {
      for (const t of rule.tests) tests.add(t);
    }
  }

  // 4. Content-type heuristics
  for (const t of contentTypeTests(ep)) tests.add(t);

  // 5. Auth-dependent tests
  if (hasAuth) {
    tests.add("csrf");
    // Any endpoint with path params that looks like object IDs → BOLA
    if (/\{(id|pk|uid|uuid|slug)\}/i.test(ep.path) || /\/\d+/.test(ep.path)) {
      tests.add("id_enumeration");
      tests.add("bopla");
      tests.add("excessive_data_exposure");
    }
  }

  // 6. Method-specific
  const method = ep.method.toUpperCase();
  if (method === "GET" && !ep.queryParams?.length && !/[:{}]/.test(ep.path)) {
    // Pure GET with no params — limited injection surface
    // Keep universal + discovery tests, drop heavy injection tests
    for (const t of ["sqli", "nosql", "xxe", "xpathi", "ldapi", "email_injection"]) {
      tests.delete(t);
    }
  }

  // 7. Tech stack includes/excludes
  for (const t of techRules.include) tests.add(t);
  for (const t of techRules.exclude) tests.delete(t);

  // 8. CVE scan for all — cheap and always relevant
  tests.add("cve_test");

  // 9. Filter to valid + eligible tags only
  const final: string[] = [];
  for (const t of tests) {
    if (validTags.has(t)) final.push(t);
  }
  return final;
}

export interface ScanGroup {
  tests: string[];
  entrypointIds: string[];
  hasPathParams: boolean;
}

/**
 * Select relevant security tests per endpoint using a two-phase approach:
 * 1. Deterministic baseline — rules-based classification using method, path,
 *    params, body, content-type, tech stack, and auth status.
 * 2. LLM refinement — the LLM reviews the baseline and can add/remove tests
 *    based on deeper understanding of the endpoint's role and context.
 *
 * Endpoints sharing the same test set are grouped for efficient scanning.
 */
export async function selectTestsPerEndpoint(
  llm: OpenAI,
  api: BrightApiContext,
  endpoints: DiscoveredEndpoint[],
  entrypointIds: string[],
  techStack: TechStack,
  hasAuth: boolean,
  model?: string,
): Promise<ScanGroup[]> {
  const availableTests = await listTests(api);

  const eligibleTests = availableTests.filter(
    (t) => !MULTI_AUTH_TESTS.has(t.tag) && !EXCLUDED_TESTS.has(t.tag),
  );
  const validTags = new Set(eligibleTests.map((t) => t.tag));

  // Phase 1: Deterministic baseline
  const techRules = techStackTests(techStack);
  const baselinePerEndpoint: string[][] = endpoints.map((ep) =>
    baselineTestsForEndpoint(ep, techRules, hasAuth, validTags),
  );

  const baselineTotal = baselinePerEndpoint.reduce((sum, t) => sum + t.length, 0);
  console.log(
    `[Tests] Baseline: ${baselineTotal} test assignments across ${endpoints.length} endpoints (avg ${(baselineTotal / Math.max(endpoints.length, 1)).toFixed(1)}/ep)`,
  );

  // Phase 2: LLM refinement — give it the baseline and let it adjust
  const stackStr = formatTechStack(techStack);
  const dbStr = techStack.databases?.length ? techStack.databases.join(", ") : "unknown";
  const testCatalog = eligibleTests
    .map((t) => `- ${t.tag}: ${t.name}`)
    .join("\n");

  const endpointList = endpoints
    .map((ep, i) => {
      const parts = [`[${i}] ${ep.method} ${ep.path}`];
      parts.push(`(${ep.filePath})`);
      if (ep.queryParams?.length) {
        parts.push(`params: ${ep.queryParams.map(p => p.name).join(",")}`);
      }
      if (ep.body) {
        const bodyPreview = ep.body.length > 80 ? ep.body.slice(0, 80) + "…" : ep.body;
        parts.push(`body: ${bodyPreview}`);
      }
      if (ep.contentType) parts.push(`type: ${ep.contentType}`);
      parts.push(`baseline: [${baselinePerEndpoint[i].join(",")}]`);
      return parts.join(" | ");
    })
    .join("\n");

  const messages: Parameters<typeof chatWithSchema>[1] = [
    {
      role: "system",
      content: `You are a DAST security expert refining test selection for a ${stackStr} application (databases: ${dbStr}, auth: ${hasAuth ? "yes" : "no"}).

Each endpoint below has a BASELINE set of tests selected by deterministic rules. Your job is to REFINE these — add tests that are missing or remove tests that are clearly irrelevant.

Guidelines:
- The baseline already considers: HTTP method, path patterns, query params, body/content-type, tech stack, auth status.
- Focus on what the rules CAN'T see: semantic meaning of the endpoint, relationships between endpoints, domain-specific risks.
- For most endpoints, the baseline is good — only change what you're confident about.
- Add tests the rules missed (e.g. a /render endpoint that should get ssti, or an /import that should get xxe).
- Remove tests that are wrong (e.g. sqli on an endpoint that clearly doesn't touch DB, or file_upload on a JSON-only endpoint).
- If the baseline is fine for an endpoint, return its tests unchanged.
- Do NOT add header_security, cookie_security, or lrrl — they are excluded by policy.`,
    },
    {
      role: "user",
      content: `Review and refine tests for each endpoint. Return the FINAL test list per endpoint.

Endpoints (with baseline tests):
${endpointList}

Available tests (use ONLY these exact tags):
${testCatalog}

Return a JSON object with the refined test list per endpoint index.`,
    },
  ];

  let perEndpoint: string[][];

  try {
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

    // Merge LLM refinement with baseline
    const indexToTests = new Map<number, string[]>();
    for (const entry of result.entries) {
      indexToTests.set(entry.index, entry.tests);
    }

    perEndpoint = endpoints.map((_, i) => {
      const refined = indexToTests.get(i);
      if (!refined) return baselinePerEndpoint[i]; // LLM didn't mention → keep baseline
      const valid = refined.filter((t) => validTags.has(t));
      return valid.length > 0 ? valid : baselinePerEndpoint[i];
    });

    // Log what the LLM changed
    let added = 0;
    let removed = 0;
    for (let i = 0; i < endpoints.length; i++) {
      const base = new Set(baselinePerEndpoint[i]);
      const final = new Set(perEndpoint[i]);
      for (const t of final) if (!base.has(t)) added++;
      for (const t of base) if (!final.has(t)) removed++;
    }
    console.log(
      `[Tests] LLM refinement: +${added} added, -${removed} removed across ${endpoints.length} endpoints`,
    );
  } catch (err) {
    console.warn(`[Tests] LLM refinement failed (${err}), using baseline only`);
    perEndpoint = baselinePerEndpoint;
  }

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

  // Hard cap on the number of concurrent Bright scans. With many endpoints
  // we'd rather have fewer scans each covering more endpoints than dozens of
  // small scans (each scan has setup overhead and consumes a parallel slot).
  const MAX_TOTAL_SCANS = 10;

  // Per-group entrypoint cap. Sized so that even when every endpoint ends
  // up in a different test-set bucket we can still fit them all inside
  // MAX_TOTAL_SCANS. Floor of 100 keeps grouping aggressive for small projects.
  const MAX_ENTRYPOINTS_PER_GROUP = Math.max(
    100,
    Math.ceil(endpoints.length / MAX_TOTAL_SCANS),
  );

  // First: consolidate same-test-set groups (cheap, preserves precision).
  // Second: split any oversized groups so no single scan exceeds the per-group cap.
  // Third: if we still have too many scans (because many distinct test sets
  // each had >cap endpoints), do a final consolidation pass to enforce the
  // hard cap by unioning test sets across the smallest groups.
  let working = consolidateGroups(groups, MAX_TOTAL_SCANS);
  working = splitLargeGroups(working, MAX_ENTRYPOINTS_PER_GROUP);
  if (working.length > MAX_TOTAL_SCANS) {
    working = consolidateGroups(working, MAX_TOTAL_SCANS);
  }
  const finalGroups = working;

  console.log(
    `[Tests] Created ${finalGroups.length} scan group(s) from ${endpoints.length} endpoints (cap: ${MAX_TOTAL_SCANS} scans, ${MAX_ENTRYPOINTS_PER_GROUP} eps/scan)`,
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
