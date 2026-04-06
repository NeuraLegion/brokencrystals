import type { BrightMcpClient } from "../mcp-client.js";
import { sleep } from "../utils.js";

export async function runSecurityScan(
  bright: BrightMcpClient,
  projectId: string,
  entrypointIds: string[],
  repeaterId: string,
  testTags: string[],
  scanName?: string,
): Promise<string> {
  console.log(`[Scan] Starting scan with ${entrypointIds.length} entrypoints, ${testTags.length} tests`);

  const args = {
    projectId,
    entrypointIds,
    repeaters: [repeaterId],
    tests: testTags,
    name: scanName ?? `Engine Scan ${new Date().toISOString()}`,
  };

  const response = await bright.callMcpToolRaw("runScan", args);

  if (response.startsWith("Error")) {
    throw new Error(`runScan failed: ${response}`);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(response);
  } catch {
    throw new Error(`Failed to parse runScan response: ${response.slice(0, 500)}`);
  }

  const scanId = (parsed.scanId ?? parsed.id ?? parsed.scan_id) as string | undefined;
  if (!scanId) {
    throw new Error(`runScan returned no scanId: ${response.slice(0, 500)}`);
  }

  console.log(`[Scan] Scan started: ${scanId}`);
  return scanId;
}

export async function waitForScanCompletion(
  bright: BrightMcpClient,
  scanId: string,
  onProgress?: (status: string, issuesFound: number) => void,
  timeoutMs = 15 * 60 * 1000,
): Promise<string> {
  const start = Date.now();
  const pollInterval = 30_000;

  // Initial wait before first poll
  await sleep(pollInterval);

  while (Date.now() - start < timeoutMs) {
    const status = await bright.getScanStatus(scanId);
    const issues = status.issuesFound ?? 0;

    onProgress?.(status.status, issues);

    const terminal = ["done", "stopped", "failed", "disrupted"];
    if (terminal.includes(status.status)) {
      console.log(`[Scan] Completed: ${status.status} (${issues} issues)`);
      return status.status;
    }

    console.log(`[Scan] Status: ${status.status} (${issues} issues found so far)`);
    await sleep(pollInterval);
  }

  console.warn(`[Scan] Timed out after ${timeoutMs / 1000}s`);
  return "timeout";
}
