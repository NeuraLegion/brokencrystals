import { readFileSync } from "fs";
import { basename } from "path";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";
import type { Finding, BrightApiContext } from "../types.js";
import type { RegisteredEntrypoint } from "./entrypoints.js";
import { chatWithTools, type ToolHandler } from "../inference.js";
import { codebaseTools, createToolHandler } from "../tools.js";
import { runSecurityScan, waitForScanCompletion, isFailureStatus } from "./scan.js";
import { fetchFindings } from "./findings.js";
import { extractJson, parseJsonLenient } from "../utils.js";

// ---------------------------------------------------------------------------
// SARIF parsing + CodeQL rule → Bright test mapping
// ---------------------------------------------------------------------------

export interface SarifFinding {
  ruleId: string;
  /** Human-readable rule/finding name (from SARIF rule metadata when available). */
  name: string;
  message: string;
  file: string;
  startLine: number;
  /** Normalized severity: Critical | High | Medium | Low. */
  severity: string;
  /** Mapped Bright test name, or null if no DAST equivalent */
  brightTest: string | null;
}

export type ValidationVerdict = "validated" | "not-validated" | "n/a";

export interface ValidationResult {
  finding: SarifFinding;
  verdict: ValidationVerdict;
  detail: string;
}

/**
 * CodeQL rule ID → Bright DAST test name mapping.
 * Only rules that have a meaningful DAST equivalent are included.
 * Everything else maps to null (N/A — SAST-only, no runtime test).
 */
const CODEQL_TO_BRIGHT: Record<string, string> = {
  // SQL injection
  "js/sql-injection": "sqli",
  "py/sql-injection": "sqli",
  "rb/sql-injection": "sqli",
  "java/sql-injection": "sqli",
  "cs/sql-injection": "sqli",
  "go/sql-injection": "sqli",

  // XSS
  "js/xss": "xss",
  "js/reflected-xss": "xss",
  "js/stored-xss": "stored_xss",
  "py/reflective-xss": "xss",
  "py/stored-xss": "stored_xss",
  "rb/reflective-xss": "xss",
  "rb/stored-xss": "stored_xss",
  "java/xss": "xss",
  "cs/web/xss": "xss",

  // SSRF
  "js/request-forgery": "ssrf",
  "py/ssrf": "ssrf",
  "java/ssrf": "ssrf",
  "rb/request-forgery": "ssrf",
  "go/ssrf": "ssrf",

  // Path traversal / LFI
  "js/path-injection": "lfi",
  "py/path-injection": "lfi",
  "java/path-injection": "lfi",
  "rb/path-injection": "lfi",
  "go/path-injection": "lfi",

  // Command injection / OS injection
  "js/command-line-injection": "osi",
  "py/command-line-injection": "osi",
  "java/command-line-injection": "osi",
  "rb/command-line-injection": "osi",
  "go/command-injection": "osi",

  // SSTI
  "js/server-side-template-injection": "ssti",
  "py/template-injection": "ssti",

  // XXE
  "java/xxe": "xxe",
  "py/xxe": "xxe",
  "cs/xml/insecure-dtd-handling": "xxe",

  // Open redirect (Bright tag: unvalidated_redirect)
  "js/server-side-unvalidated-url-redirection": "unvalidated_redirect",
  "py/url-redirection": "unvalidated_redirect",
  "java/unvalidated-url-redirection": "unvalidated_redirect",
  "rb/url-redirection": "unvalidated_redirect",

  // NoSQL injection — no dedicated DAST test in Bright; treated as N/A.

  // LDAP injection
  "java/ldap-injection": "ldapi",
  "cs/ldap-injection": "ldapi",

  // XPath injection
  "java/xml/xpath-injection": "xpathi",
  "py/xpath-injection": "xpathi",

  // Prototype pollution
  "js/prototype-polluting-assignment": "proto_pollution",
  "js/prototype-pollution-utility": "proto_pollution",

  // JWT issues
  "js/insecure-jwt-verification": "jwt",
  "py/insecure-jwt": "jwt",

  // CSRF
  "js/missing-token-validation": "csrf",
  "py/csrf-protection-disabled": "csrf",

  // Header injection
  "js/header-injection": "header_security",

  // Remote file inclusion
  "php/remote-file-inclusion": "rfi",
  "js/remote-file-inclusion": "rfi",
};

/**
 * Parse a SARIF file and map each finding to its Bright test equivalent.
 * Returns all findings with their mapped test (or null for N/A).
 */
export function parseSarif(sarifPath: string): SarifFinding[] {
  const raw = readFileSync(sarifPath, "utf-8");
  const sarif = JSON.parse(raw);
  const findings: SarifFinding[] = [];

  for (const run of sarif.runs ?? []) {
    // Index the run's rule metadata (name + default severity) by rule id.
    const ruleIndex = new Map<string, { name?: string; severity?: string }>();
    const rules = run.tool?.driver?.rules ?? [];
    for (const r of rules) {
      if (!r?.id) continue;
      const name = r.name ?? r.shortDescription?.text;
      const cvss = r.properties?.["security-severity"];
      const level = r.defaultConfiguration?.level;
      ruleIndex.set(r.id, { name, severity: normalizeSarifSeverity(cvss, level) });
    }

    for (const result of run.results ?? []) {
      const ruleId = result.ruleId ?? result.rule?.id ?? "";
      const message = result.message?.text ?? "";

      // Get the primary location
      const loc = result.locations?.[0]?.physicalLocation;
      const file = loc?.artifactLocation?.uri ?? "";
      const startLine = loc?.region?.startLine ?? 0;

      const brightTest = CODEQL_TO_BRIGHT[ruleId] ?? null;

      // Severity: prefer the result's own, else the rule default.
      const ruleMeta = ruleIndex.get(ruleId);
      const resultCvss = result.properties?.["security-severity"];
      const severity =
        normalizeSarifSeverity(resultCvss, result.level) ??
        ruleMeta?.severity ??
        "Medium";

      // Name: rule metadata name, else a humanized rule id.
      const name = ruleMeta?.name ?? humanizeRuleId(ruleId);

      findings.push({ ruleId, name, message, file, startLine, severity, brightTest });
    }
  }

  return findings;
}

/**
 * Normalize a SARIF severity to Critical | High | Medium | Low.
 * Prefers a numeric CVSS "security-severity" score, falling back to the SARIF
 * level (error/warning/note). Returns undefined if neither is present.
 */
function normalizeSarifSeverity(
  cvss: unknown,
  level: unknown,
): string | undefined {
  const score = typeof cvss === "string" ? parseFloat(cvss) : typeof cvss === "number" ? cvss : NaN;
  if (!Number.isNaN(score)) {
    if (score >= 9.0) return "Critical";
    if (score >= 7.0) return "High";
    if (score >= 4.0) return "Medium";
    if (score > 0) return "Low";
  }
  switch (level) {
    case "error":
      return "High";
    case "warning":
      return "Medium";
    case "note":
    case "none":
      return "Low";
    default:
      return undefined;
  }
}

/** Turn a CodeQL rule id like "js/sql-injection" into "Sql Injection". */
function humanizeRuleId(ruleId: string): string {
  const tail = ruleId.split("/").pop() ?? ruleId;
  return tail
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Get findings grouped by verdict category for summary output.
 */
export function summarizeResults(results: ValidationResult[]): {
  validated: ValidationResult[];
  notValidated: ValidationResult[];
  notApplicable: ValidationResult[];
} {
  return {
    validated: results.filter((r) => r.verdict === "validated"),
    notValidated: results.filter((r) => r.verdict === "not-validated"),
    notApplicable: results.filter((r) => r.verdict === "n/a"),
  };
}

// ---------------------------------------------------------------------------
// Finding → endpoint correlation
// ---------------------------------------------------------------------------

/** A mappable finding paired with the entrypoint IDs that can exercise it. */
export interface MappedFinding {
  finding: SarifFinding;
  entrypointIds: string[];
  /** True when call-graph tracing found no path from any endpoint (likely dead/unreachable code). */
  unreachable?: boolean;
}

/** True if a SARIF file path and an endpoint's source file refer to the same file. */
function filesMatch(sarifFile: string, endpointFile: string): boolean {
  if (!sarifFile || !endpointFile) return false;
  const a = sarifFile.replace(/\\/g, "/").toLowerCase();
  const b = endpointFile.replace(/\\/g, "/").toLowerCase();
  if (a === b) return true;
  // SARIF URIs are often repo-relative; endpoint paths may carry a service prefix.
  // Match on suffix or shared basename.
  if (a.endsWith(b) || b.endsWith(a)) return true;
  return basename(a) === basename(b) && basename(a).length > 0;
}

/**
 * Map each mappable SARIF finding to the registered entrypoint(s) that exercise
 * its vulnerable code path.
 *
 * Strategy:
 *  1. Direct file match — finding's source file == an endpoint's controller file.
 *  2. Call-graph tracing — for findings in service/model/util files, the LLM
 *     uses codebase tools (read/grep/list) to follow callers from the vulnerable
 *     function up to the controller/route that reaches it. Findings in the same
 *     source file share a trace (same reachability), so we trace per unique file.
 *  3. If a real trace finds no path, the code is unreachable/dead — flagged as
 *     such rather than broad-scanning (which would risk false validations).
 */
export async function mapFindingsToEndpoints(
  llm: OpenAI,
  findings: SarifFinding[],
  registered: RegisteredEntrypoint[],
  model: string,
  repoPath: string,
): Promise<MappedFinding[]> {
  const mappable = findings.filter((f) => f.brightTest !== null);
  const mapped: MappedFinding[] = [];
  const needsTrace: SarifFinding[] = [];

  for (const finding of mappable) {
    const direct = registered.filter((r) =>
      filesMatch(finding.file, r.endpoint.filePath),
    );
    if (direct.length > 0) {
      mapped.push({ finding, entrypointIds: direct.map((r) => r.entrypointId) });
    } else {
      needsTrace.push(finding);
    }
  }

  if (needsTrace.length === 0) return mapped;

  // Group findings by source file — reachability is per-file, so one trace per
  // unique file covers all its findings.
  const byFile = new Map<string, SarifFinding[]>();
  for (const f of needsTrace) {
    const key = f.file || "<unknown>";
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key)!.push(f);
  }

  const handler = createToolHandler(repoPath);
  const files = [...byFile.entries()];

  // Trace files concurrently (bounded) — independent of each other.
  const CONCURRENCY = 4;
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(([file, fileFindings]) =>
        traceFileToEndpoints(llm, file, fileFindings, registered, handler, model),
      ),
    );
    for (const r of results) mapped.push(...r);
  }

  return mapped;
}

/**
 * Trace a single source file to the endpoint(s) that reach it, using codebase
 * tools to follow the call graph. Returns a MappedFinding per finding in the file.
 */
async function traceFileToEndpoints(
  llm: OpenAI,
  file: string,
  fileFindings: SarifFinding[],
  registered: RegisteredEntrypoint[],
  handler: ToolHandler,
  model: string,
): Promise<MappedFinding[]> {
  const endpointList = registered.map((r, i) => ({
    index: i,
    method: r.endpoint.method,
    path: r.endpoint.path,
    file: r.endpoint.filePath,
  }));

  const lines = [...new Set(fileFindings.map((f) => f.startLine))].sort((a, b) => a - b);
  const rules = [...new Set(fileFindings.map((f) => f.ruleId))];

  const prompt = `You are tracing a static-analysis (CodeQL) finding to the live HTTP endpoint(s) that reach its vulnerable code, so a DAST scanner can validate it.

VULNERABLE FILE: ${file}
LINES: ${lines.join(", ")}
CODEQL RULES: ${rules.join(", ")}

Your job: find which registered endpoint(s) can reach this code at runtime. Use the tools to go down the call graph:
- read_file to inspect the vulnerable file and understand which function/export contains the flagged lines
- search_files to find who imports/calls that function (trace callers upward)
- repeat until you reach a controller/route handler that maps to one of the registered endpoints below

Almost everything is reachable through SOME endpoint. Only conclude "unreachable" if the code is genuinely dead — no caller chain leads to any registered endpoint (e.g. it is only called from tests, CLI scripts, or unused exports).

REGISTERED ENDPOINTS:
${JSON.stringify(endpointList, null, 2)}

When done, respond with ONLY a JSON object:
{ "endpointIndices": [<indices of reaching endpoints>], "reachable": true }
or, if it is genuinely dead/unreachable code:
{ "endpointIndices": [], "reachable": false }`;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: "You are a precise security data-flow analyst. Trace call graphs using the tools, then respond with JSON only." },
    { role: "user", content: prompt },
  ];

  let raw: string;
  try {
    raw = await chatWithTools(llm, messages, codebaseTools, handler, model, 20);
  } catch {
    // Trace errored — leave unmapped (treated as inconclusive downstream).
    return fileFindings.map((finding) => ({ finding, entrypointIds: [], unreachable: false }));
  }

  let parsed: { endpointIndices?: number[]; reachable?: boolean } = {};
  try {
    parsed = parseJsonLenient(extractJson(raw)) as { endpointIndices?: number[]; reachable?: boolean };
  } catch {
    return fileFindings.map((finding) => ({ finding, entrypointIds: [], unreachable: false }));
  }

  const indices = Array.isArray(parsed.endpointIndices) ? parsed.endpointIndices : [];
  const entrypointIds = indices
    .map((idx) => registered[idx]?.entrypointId)
    .filter((id): id is string => Boolean(id));

  // No endpoints found AND the model declared it unreachable → dead code.
  const unreachable = entrypointIds.length === 0 && parsed.reachable === false;

  return fileFindings.map((finding) => ({ finding, entrypointIds, unreachable }));
}

// ---------------------------------------------------------------------------
// Targeted scan + verdict
// ---------------------------------------------------------------------------

/**
 * Run targeted DAST scans for the mapped findings and produce a verdict per
 * SARIF finding. No fix loop — this only validates.
 *
 * Scans are grouped by Bright test so each test runs once over the union of its
 * findings' endpoints (broad-scan findings pull in all endpoints for that test).
 */
export async function runValidationScans(
  api: BrightApiContext,
  projectId: string,
  repeaterId: string,
  registered: RegisteredEntrypoint[],
  allFindings: SarifFinding[],
  mapped: MappedFinding[],
  hasPathParams: boolean,
): Promise<ValidationResult[]> {
  // Group mapped findings by Bright test, unioning their target endpoints.
  // Findings with no mapped endpoint (unreachable/inconclusive) are NOT scanned
  // — broad-scanning every endpoint is both expensive and risks false
  // validations (an unrelated finding of the same class on another endpoint).
  const byTest = new Map<string, Set<string>>();
  for (const m of mapped) {
    if (m.entrypointIds.length === 0) continue;
    const test = m.finding.brightTest!;
    if (!byTest.has(test)) byTest.set(test, new Set());
    const set = byTest.get(test)!;
    for (const id of m.entrypointIds) set.add(id);
  }

  // Launch one scan per test.
  const scanIds: string[] = [];
  for (const [test, idSet] of byTest.entries()) {
    const ids = [...idSet];
    if (ids.length === 0) continue;
    try {
      const scanId = await runSecurityScan(
        projectId,
        ids,
        repeaterId,
        [test],
        api,
        `Validation — ${test}`,
        hasPathParams,
        true, // smart scan — the zero-findings issue was param extraction, not smart
      );
      scanIds.push(scanId);
      console.log(`[Validation] Launched scan for test "${test}" over ${ids.length} endpoint(s): ${scanId}`);
    } catch (err) {
      console.error(`[Validation] Failed to launch scan for test "${test}": ${err}`);
    }
  }

  // Wait for all scans.
  await Promise.allSettled(
    scanIds.map((scanId) =>
      waitForScanCompletion(api, scanId, (status, issues) => {
        console.log(`[Validation] Scan ${scanId}: ${status} — ${issues} issue(s)`);
      }),
    ),
  );

  // Collect Bright findings.
  const brightFindings = await fetchFindings(api, scanIds);

  return buildVerdicts(allFindings, mapped, brightFindings);
}

/** Match Bright DAST findings back to SARIF findings to produce verdicts. */
export function buildVerdicts(
  allFindings: SarifFinding[],
  mapped: MappedFinding[],
  brightFindings: Finding[],
): ValidationResult[] {
  const mappedSet = new Map<SarifFinding, MappedFinding>();
  for (const m of mapped) mappedSet.set(m.finding, m);

  return allFindings.map((finding) => {
    // No DAST equivalent → N/A.
    if (finding.brightTest === null) {
      return {
        finding,
        verdict: "n/a" as const,
        detail: `CodeQL rule "${finding.ruleId}" has no DAST equivalent — cannot be validated dynamically.`,
      };
    }

    const m = mappedSet.get(finding);
    const targetIds = m?.entrypointIds ?? [];

    // No endpoint reaches this code. Distinguish dead code from an inconclusive
    // trace, but in both cases there is nothing for DAST to confirm.
    if (targetIds.length === 0) {
      if (m?.unreachable) {
        return {
          finding,
          verdict: "not-validated" as const,
          detail: `Code at ${finding.file}:${finding.startLine} is not reachable from any registered endpoint (likely dead/unused code) — cannot be exercised by DAST.`,
        };
      }
      return {
        finding,
        verdict: "not-validated" as const,
        detail: `Could not trace ${finding.file}:${finding.startLine} to a live endpoint — no DAST scan was run for it.`,
      };
    }

    // Did Bright produce a finding with the same test tag on a mapped endpoint?
    const match = brightFindings.find(
      (bf) =>
        bf.testTag === finding.brightTest &&
        bf.entrypointId !== undefined &&
        targetIds.includes(bf.entrypointId),
    );

    if (match) {
      return {
        finding,
        verdict: "validated" as const,
        detail: `Bright confirmed ${finding.brightTest} at ${match.method} ${match.url} (severity: ${match.severity}).`,
      };
    }

    return {
      finding,
      verdict: "not-validated" as const,
      detail: `Bright ran ${finding.brightTest} against the mapped endpoint(s) but could not reproduce the issue dynamically.`,
    };
  });
}

/** Render a human-readable validation report. */
export function formatValidationReport(results: ValidationResult[]): string {
  const { validated, notValidated, notApplicable } = summarizeResults(results);
  const lines: string[] = [];
  lines.push("═══════════════════════════════════════════════════");
  lines.push(`[Validation] CodeQL → DAST validation report`);
  lines.push(`[Validation]   Total findings: ${results.length}`);
  lines.push(`[Validation]   ✓ Validated:     ${validated.length}`);
  lines.push(`[Validation]   ✗ Not validated: ${notValidated.length}`);
  lines.push(`[Validation]   – N/A (no DAST): ${notApplicable.length}`);
  lines.push("───────────────────────────────────────────────────");
  for (const r of results) {
    const mark = r.verdict === "validated" ? "✓" : r.verdict === "not-validated" ? "✗" : "–";
    lines.push(`[Validation] ${mark} [${r.verdict}] ${r.finding.ruleId} @ ${r.finding.file}:${r.finding.startLine}`);
    lines.push(`[Validation]     ${r.detail}`);
  }
  lines.push("═══════════════════════════════════════════════════");
  return lines.join("\n");
}

/** Convert validation results into PR-table rows for ProgressReporter. */
export function toValidationSummaryRows(
  results: ValidationResult[],
): Array<{
  severity: string;
  name: string;
  rule: string;
  location: string;
  verdict: ValidationVerdict;
}> {
  return results.map((r) => ({
    severity: r.finding.severity,
    name: r.finding.name,
    rule: r.finding.ruleId,
    location: `${r.finding.file}:${r.finding.startLine}`,
    verdict: r.verdict,
  }));
}
