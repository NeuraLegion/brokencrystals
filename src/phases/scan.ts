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
  let tests = [...testTags];
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const body = {
      name: scanName ?? `Engine Scan ${new Date().toISOString()}`,
      projectId,
      module: "dast",
      entryPointIds: entrypointIds,
      repeaters: [repeaterId],
      tests,
      attackParamLocations,
      smart: true,
      skipStaticParams: true,
      poolSize: 10,
    };

    let res: Response;
    try {
      res = await fetch(`https://${brightHostname}/api/v1/scans`, {
        method: "POST",
        headers: {
          Authorization: `Api-Key ${brightToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // TCP/network error — retry
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Scan] Network error on attempt ${attempt}/${maxRetries}: ${msg}`);
      if (attempt < maxRetries) {
        await sleep(5_000 * attempt);
        continue;
      }
      throw new Error(`runScan failed after ${maxRetries} attempts: ${msg}`);
    }

    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      const scanId = (data.id ?? data.scanId) as string | undefined;
      if (!scanId) {
        throw new Error(`runScan REST returned no scanId: ${JSON.stringify(data).slice(0, 500)}`);
      }
      console.log(`[Scan] Scan started (REST): ${scanId}`);
      return scanId;
    }

    const text = await res.text();

    // Rate limit — back off and retry
    if (res.status === 429) {
      console.warn(`[Scan] Rate limited (attempt ${attempt}/${maxRetries}), backing off...`);
      if (attempt < maxRetries) {
        await sleep(10_000 * attempt);
        continue;
      }
      throw new Error(`runScan rate limited after ${maxRetries} attempts`);
    }

    // Server error — retry
    if (res.status >= 500) {
      console.warn(`[Scan] Server error ${res.status} (attempt ${attempt}/${maxRetries}): ${text.slice(0, 200)}`);
      if (attempt < maxRetries) {
        await sleep(5_000 * attempt);
        continue;
      }
      throw new Error(`runScan REST failed (${res.status}): ${text.slice(0, 500)}`);
    }

    // 400 config error — try to auto-fix by removing problematic tests
    if (res.status === 400) {
      const fixed = tryFixScanConfig(text, tests);
      if (fixed && attempt < maxRetries) {
        tests = fixed;
        console.log(`[Scan] Retrying with ${tests.length} tests after removing incompatible ones`);
        continue;
      }
    }

    throw new Error(`runScan REST failed (${res.status}): ${text.slice(0, 500)}`);
  }

  throw new Error("runScan: exhausted retries");
}

/**
 * Try to fix scan config by parsing the error and removing offending tests.
 * Returns the fixed test list, or null if the error isn't fixable.
 */
function tryFixScanConfig(errorText: string, tests: string[]): string[] | null {
  const lower = errorText.toLowerCase();

  // "X test is mutually exclusive with other tests"
  if (lower.includes("mutually exclusive")) {
    // Try to identify which test from the error message
    const exclusiveTests = ["lrrl"];
    const filtered = tests.filter((t) => !exclusiveTests.some((ex) => lower.includes(ex) || t === ex));
    if (filtered.length < tests.length && filtered.length > 0) {
      console.log(`[Scan] Removed mutually exclusive test(s), ${tests.length} → ${filtered.length}`);
      return filtered;
    }
  }

  // "multiple auth attack tests" — remove broken_access_control
  if (lower.includes("multiple auth attack tests") || lower.includes("custom auth objects")) {
    const filtered = tests.filter((t) => t !== "broken_access_control");
    if (filtered.length < tests.length && filtered.length > 0) {
      console.log(`[Scan] Removed multi-auth test(s), ${tests.length} → ${filtered.length}`);
      return filtered;
    }
  }

  return null;
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
