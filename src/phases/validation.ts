import { readFileSync } from "fs";
import { basename } from "path";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";
import type { Finding, BrightApiContext } from "../types.js";
import type { RegisteredEntrypoint } from "./entrypoints.js";
import { chatWithTools } from "../inference.js";
import { runSecurityScan, waitForScanCompletion, isFailureStatus } from "./scan.js";
import { fetchFindings } from "./findings.js";
import { extractJson, parseJsonLenient } from "../utils.js";

// ---------------------------------------------------------------------------
// SARIF parsing + CodeQL rule → Bright test mapping
// ---------------------------------------------------------------------------

export interface SarifFinding {
  ruleId: string;
  message: string;
  file: string;
  startLine: number;
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

  // Open redirect
  "js/server-side-unvalidated-url-redirection": "open_redirect",
  "py/url-redirection": "open_redirect",
  "java/unvalidated-url-redirection": "open_redirect",
  "rb/url-redirection": "open_redirect",

  // NoSQL injection
  "js/nosql-injection": "nosql",

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
    for (const result of run.results ?? []) {
      const ruleId = result.ruleId ?? result.rule?.id ?? "";
      const message = result.message?.text ?? "";

      // Get the primary location
      const loc = result.locations?.[0]?.physicalLocation;
      const file = loc?.artifactLocation?.uri ?? "";
      const startLine = loc?.region?.startLine ?? 0;

      const brightTest = CODEQL_TO_BRIGHT[ruleId] ?? null;

      findings.push({ ruleId, message, file, startLine, brightTest });
    }
  }

  return findings;
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
  entrypointIds: string[]; // empty = scan broadly (all endpoints) with the test
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
 *  2. LLM correlation — for findings in service/model/util files, ask the model
 *     which endpoint(s) reach that code via data flow.
 *  3. Fallback — associate with all endpoints (broad scan) so we never emit a
 *     false "not-validated" just because mapping was uncertain.
 */
export async function mapFindingsToEndpoints(
  llm: OpenAI,
  findings: SarifFinding[],
  registered: RegisteredEntrypoint[],
  model: string,
): Promise<MappedFinding[]> {
  const mappable = findings.filter((f) => f.brightTest !== null);
  const mapped: MappedFinding[] = [];
  const needsLlm: SarifFinding[] = [];

  for (const finding of mappable) {
    const direct = registered.filter((r) =>
      filesMatch(finding.file, r.endpoint.filePath),
    );
    if (direct.length > 0) {
      mapped.push({ finding, entrypointIds: direct.map((r) => r.entrypointId) });
    } else {
      needsLlm.push(finding);
    }
  }

  if (needsLlm.length > 0) {
    const llmMapped = await correlateViaLlm(llm, needsLlm, registered, model);
    mapped.push(...llmMapped);
  }

  return mapped;
}

/** Ask the LLM to correlate findings (in non-controller files) to endpoints. */
async function correlateViaLlm(
  llm: OpenAI,
  findings: SarifFinding[],
  registered: RegisteredEntrypoint[],
  model: string,
): Promise<MappedFinding[]> {
  const endpointList = registered.map((r, i) => ({
    index: i,
    id: r.entrypointId,
    method: r.endpoint.method,
    path: r.endpoint.path,
    file: r.endpoint.filePath,
  }));

  const prompt = `You are correlating static-analysis (CodeQL) findings to live HTTP endpoints for DAST validation.

For each finding, identify which endpoint(s) reach the vulnerable code at runtime. A finding in a service/model/helper file is reachable through whichever controller(s) call that code.

ENDPOINTS:
${JSON.stringify(endpointList, null, 2)}

FINDINGS:
${JSON.stringify(
  findings.map((f, i) => ({
    index: i,
    rule: f.ruleId,
    file: f.file,
    line: f.startLine,
    message: f.message.slice(0, 200),
  })),
  null,
  2,
)}

Return ONLY a JSON array. For each finding, give the endpoint indices that can exercise it. If you cannot determine any endpoint, use an empty array (the scanner will then test all endpoints with the relevant attack):
[{ "findingIndex": 0, "endpointIndices": [2, 5] }, ...]`;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: "You are a precise security data-flow analyst. Respond with JSON only." },
    { role: "user", content: prompt },
  ];

  let raw: string;
  try {
    raw = await chatWithTools(llm, messages, [], async () => "", model, 1);
  } catch {
    // LLM failed — fall back to broad scan for all of these.
    return findings.map((finding) => ({ finding, entrypointIds: [] }));
  }

  let parsed: Array<{ findingIndex: number; endpointIndices: number[] }> = [];
  try {
    parsed = parseJsonLenient(extractJson(raw)) as Array<{ findingIndex: number; endpointIndices: number[] }>;
  } catch {
    return findings.map((finding) => ({ finding, entrypointIds: [] }));
  }

  const byIndex = new Map<number, number[]>();
  for (const entry of parsed) {
    if (typeof entry?.findingIndex === "number") {
      byIndex.set(entry.findingIndex, Array.isArray(entry.endpointIndices) ? entry.endpointIndices : []);
    }
  }

  return findings.map((finding, i) => {
    const indices = byIndex.get(i) ?? [];
    const entrypointIds = indices
      .map((idx) => registered[idx]?.entrypointId)
      .filter((id): id is string => Boolean(id));
    return { finding, entrypointIds };
  });
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
  const allEntrypointIds = registered.map((r) => r.entrypointId);

  // Group mapped findings by Bright test, unioning their target endpoints.
  const byTest = new Map<string, Set<string>>();
  for (const m of mapped) {
    const test = m.finding.brightTest!;
    if (!byTest.has(test)) byTest.set(test, new Set());
    const set = byTest.get(test)!;
    if (m.entrypointIds.length === 0) {
      // Broad scan — this test must cover every endpoint.
      for (const id of allEntrypointIds) set.add(id);
    } else {
      for (const id of m.entrypointIds) set.add(id);
    }
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

    // Did Bright produce a finding with the same test tag (and matching
    // endpoint when we have a specific mapping)?
    const match = brightFindings.find((bf) => {
      if (bf.testTag !== finding.brightTest) return false;
      if (targetIds.length === 0) return true; // broad scan — any endpoint counts
      return bf.entrypointId !== undefined && targetIds.includes(bf.entrypointId);
    });

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
