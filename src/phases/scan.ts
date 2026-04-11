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

const TERMINAL_STATUSES = new Set(["done", "completed", "stopped", "failed", "disrupted"]);

function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status.toLowerCase());
}

function isFailureStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === "failed" || s === "disrupted" || s === "timeout";
}

export { isFailureStatus };

export async function waitForScanCompletion(
  brightToken: string,
  brightHostname: string,
  scanId: string,
  onProgress?: (status: string, issuesFound: number) => void,
): Promise<string> {
  const pollInterval = 30_000;

  // Initial wait before first poll
  await sleep(pollInterval);

  while (true) {
    const scanStatus = await getScanStatusViaRest(brightToken, brightHostname, scanId);
    const issues = scanStatus.issuesFound;

    onProgress?.(scanStatus.status, issues);

    if (isTerminalStatus(scanStatus.status)) {
      console.log(`[Scan] Completed: ${scanStatus.status} (${issues} issues)`);
      return scanStatus.status.toLowerCase();
    }

    console.log(`[Scan] Status: ${scanStatus.status} (${issues} issues found so far)`);
    await sleep(pollInterval);
  }
}

async function getScanStatusViaRest(
  brightToken: string,
  brightHostname: string,
  scanId: string,
): Promise<{ status: string; issuesFound: number }> {
  const url = `https://${brightHostname}/api/v1/scans/${encodeURIComponent(scanId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Api-Key ${brightToken}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`getScanStatus failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as Record<string, unknown>;

  let issuesFound = 0;
  if (data.issuesBySeverity && typeof data.issuesBySeverity === "object") {
    for (const val of Object.values(data.issuesBySeverity as Record<string, unknown>)) {
      if (typeof val === "number") {
        issuesFound += val;
      } else if (typeof val === "object" && val !== null && "total" in val) {
        issuesFound += Number((val as Record<string, unknown>).total) || 0;
      }
    }
  } else if (typeof data.issuesFound === "number") {
    issuesFound = data.issuesFound;
  }

  return {
    status: (data.status as string) ?? "unknown",
    issuesFound,
  };
}
