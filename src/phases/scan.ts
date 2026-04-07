import type { BrightMcpClient } from "../mcp-client.js";
import { sleep } from "../utils.js";

const DEFAULT_ATTACK_LOCATIONS = ["body", "query", "fragment"];
const PATH_ATTACK_LOCATIONS = ["body", "query", "fragment", "path"];

export async function runSecurityScan(
  projectId: string,
  entrypointIds: string[],
  repeaterId: string,
  testTags: string[],
  brightToken: string,
  brightHostname: string,
  scanName?: string,
  hasPathParams = false,
): Promise<string> {
  const locations = hasPathParams ? PATH_ATTACK_LOCATIONS : DEFAULT_ATTACK_LOCATIONS;
  console.log(`[Scan] Starting scan with ${entrypointIds.length} entrypoints, ${testTags.length} tests, attack locations: ${locations.join(", ")}`);

  return runScanViaRest(
    brightToken, brightHostname, projectId, entrypointIds,
    repeaterId, testTags, locations, scanName,
  );
}

async function runScanViaRest(
  brightToken: string,
  brightHostname: string,
  projectId: string,
  entrypointIds: string[],
  repeaterId: string,
  testTags: string[],
  attackParamLocations: string[],
  scanName?: string,
): Promise<string> {
  const body = {
    projectId,
    entrypointIds,
    repeaters: [repeaterId],
    tests: testTags,
    attackParamLocations,
    name: scanName ?? `Engine Scan ${new Date().toISOString()}`,
  };

  const res = await fetch(`https://${brightHostname}/api/v1/scans`, {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${brightToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`runScan REST failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const scanId = (data.id ?? data.scanId) as string | undefined;
  if (!scanId) {
    throw new Error(`runScan REST returned no scanId: ${JSON.stringify(data).slice(0, 500)}`);
  }

  console.log(`[Scan] Scan started (REST): ${scanId}`);
  return scanId;
}

export async function waitForScanCompletion(
  bright: BrightMcpClient,
  scanId: string,
  onProgress?: (status: string, issuesFound: number) => void,
  timeoutMs = 40 * 60 * 1000,
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
