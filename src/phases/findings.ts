import type { BrightApiContext, Finding } from "../types.js";
import { findingKey } from "../utils.js";

/**
 * Fetches issues discovered during the current run's scans via the Bright REST
 * API (`GET /api/v1/scans/{scanId}/issues`). This returns only scan-level
 * issues — not stale project-level ones — so results reflect exactly what this
 * run found.
 */
export async function fetchFindings(api: BrightApiContext, scanIds: string[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const scanId of scanIds) {
    const issues = await fetchScanIssues(api, scanId);
    for (const issue of issues) {
      // Deduplicate across scan groups (same project-issue can surface in multiple scans)
      const key = findingKey({
        name: issue.name,
        method: issue.method ?? "GET",
        url: issue.url ?? "",
      });
      if (seen.has(key)) continue;
      seen.add(key);

      const severity = normalizeSeverity(issue.severity);

      findings.push({
        id: issue.id,
        name: issue.name,
        severity,
        url: issue.url ?? "",
        method: issue.method ?? "GET",
        details: issue.details ?? "",
        remedy: issue.remedy ?? "",
        entrypointId: issue.entryPointId,
        testTag: extractIssueTestTag(issue),
        issueId: issue.id,
      });
    }
  }

  return findings;
}

interface ScanIssue {
  id: string;
  name: string;
  severity: string;
  url?: string;
  method?: string;
  details?: string;
  remedy?: string;
  entryPointId?: string;
  testTag?: string;
  testId?: string;
  testName?: string;
  type?: string;
  issueType?: string;
  category?: string;
  test?: string | { tag?: string; id?: string; name?: string };
}

async function fetchScanIssues(api: BrightApiContext, scanId: string): Promise<ScanIssue[]> {
  const url = `https://${api.brightHostname}/api/v1/scans/${encodeURIComponent(scanId)}/issues`;
  console.log(`[Findings] Fetching issues for scan ${scanId}`);

  const res = await fetch(url, {
    headers: { Authorization: `Api-Key ${api.brightToken}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[Findings] Failed to fetch issues for scan ${scanId}: ${res.status} ${body}`);
    return [];
  }

  const data: ScanIssue[] = (await res.json()) as ScanIssue[];
  console.log(`[Findings] Scan ${scanId}: ${data.length} issues`);
  return data;
}

function normalizeSeverity(s: string): "Critical" | "High" | "Medium" | "Low" {
  const lower = s.toLowerCase();
  if (lower === "critical") return "Critical";
  if (lower === "high") return "High";
  if (lower === "medium") return "Medium";
  return "Low";
}

function extractIssueTestTag(issue: ScanIssue): string | undefined {
  if (typeof issue.testTag === "string") return issue.testTag;
  if (typeof issue.testId === "string") return issue.testId;
  if (typeof issue.test === "string") return issue.test;
  if (issue.test && typeof issue.test === "object") {
    return issue.test.tag ?? issue.test.id;
  }
  return undefined;
}
