import type { Finding } from "../types.js";

/**
 * Fetches issues discovered during the current run's scans via the Bright REST
 * API (`GET /api/v1/scans/{scanId}/issues`). This returns only scan-level
 * issues — not stale project-level ones — so results reflect exactly what this
 * run found.
 */
export async function fetchFindings(
  brightToken: string,
  brightHostname: string,
  scanIds: string[],
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const scanId of scanIds) {
    const issues = await fetchScanIssues(brightToken, brightHostname, scanId);
    for (const issue of issues) {
      // Deduplicate across scan groups (same project-issue can surface in multiple scans)
      const key = `${issue.name}::${issue.url}::${issue.method}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const severity = normalizeSeverity(issue.severity);
      if (severity === "Low") continue; // skip low-severity noise

      findings.push({
        id: issue.id,
        name: issue.name,
        severity,
        url: issue.url ?? "",
        method: issue.method ?? "GET",
        details: issue.details ?? "",
        remedy: issue.remedy ?? "",
        entrypointId: issue.entryPointId,
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
}

async function fetchScanIssues(
  brightToken: string,
  hostname: string,
  scanId: string,
): Promise<ScanIssue[]> {
  const url = `https://${hostname}/api/v1/scans/${encodeURIComponent(scanId)}/issues`;
  console.log(`[Findings] Fetching issues for scan ${scanId}`);

  const res = await fetch(url, {
    headers: { Authorization: `Api-Key ${brightToken}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[Findings] Failed to fetch issues for scan ${scanId}: ${res.status} ${body}`);
    return [];
  }

  const data: ScanIssue[] = await res.json();
  console.log(`[Findings] Scan ${scanId}: ${data.length} issues`);
  return data;
}

function normalizeSeverity(
  s: string,
): "Critical" | "High" | "Medium" | "Low" {
  const lower = s.toLowerCase();
  if (lower === "critical") return "Critical";
  if (lower === "high") return "High";
  if (lower === "medium") return "Medium";
  return "Low";
}
