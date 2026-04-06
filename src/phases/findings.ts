import type { BrightMcpClient } from "../mcp-client.js";
import type { Finding } from "../types.js";

export async function fetchFindings(
  bright: BrightMcpClient,
  projectId: string,
): Promise<Finding[]> {
  const issues = await bright.listIssues(projectId, {
    severity: ["Critical", "High", "Medium"],
    status: ["new", "recurring"],
    limit: 100,
  });

  return issues.map((issue) => ({
    id: issue.id,
    name: issue.name,
    severity: normalizeSeverity(issue.severity),
    url: issue.url ?? "",
    method: issue.method ?? "GET",
    details: issue.details ?? "",
    remedy: issue.remedy ?? "",
    entrypointId: issue.entrypointId,
    issueId: issue.id,
  }));
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
