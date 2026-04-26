import { sleep, toErrorMessage } from "../utils.js";
import type { BrightApiContext } from "../types.js";
import type { AppHealthMonitor } from "../app-health.js";

const DEFAULT_ATTACK_LOCATIONS = ["body", "query", "fragment"];
const PATH_ATTACK_LOCATIONS = ["body", "query", "fragment", "path"];

export async function runSecurityScan(
  projectId: string,
  entrypointIds: string[],
  repeaterId: string,
  testTags: string[],
  api: BrightApiContext,
  scanName?: string,
  hasPathParams = false,
): Promise<string> {
  const locations = hasPathParams
    ? PATH_ATTACK_LOCATIONS
    : DEFAULT_ATTACK_LOCATIONS;
  console.log(
    `[Scan] Starting scan with ${entrypointIds.length} entrypoints, ${testTags.length} tests [${testTags.join(", ")}], attack locations: ${locations.join(", ")}`,
  );

  return runScanViaRest(
    api,
    projectId,
    entrypointIds,
    repeaterId,
    testTags,
    locations,
    scanName,
  );
}

async function runScanViaRest(
  api: BrightApiContext,
  projectId: string,
  entrypointIds: string[],
  repeaterId: string,
  testTags: string[],
  attackParamLocations: string[],
  scanName?: string,
): Promise<string> {
  let tests = [...testTags];
  let eps = [...entrypointIds];
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const body = {
      name: scanName ?? `Engine Scan ${new Date().toISOString()}`,
      projectId,
      module: "dast",
      entryPointIds: eps,
      repeaters: [repeaterId],
      tests,
      attackParamLocations,
      smart: true,
      skipStaticParams: true,
      poolSize: 10,
    };

    let res: Response;
    try {
      res = await fetch(`https://${api.brightHostname}/api/v1/scans`, {
        method: "POST",
        headers: {
          Authorization: `Api-Key ${api.brightToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // TCP/network error — retry
      const msg = toErrorMessage(err);
      console.warn(
        `[Scan] Network error on attempt ${attempt}/${maxRetries}: ${msg}`,
      );
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
        throw new Error(
          `runScan REST returned no scanId: ${JSON.stringify(data).slice(0, 500)}`,
        );
      }
      console.log(`[Scan] Scan started (REST): ${scanId}`);
      return scanId;
    }

    const text = await res.text();

    // Rate limit — back off and retry
    if (res.status === 429) {
      console.warn(
        `[Scan] Rate limited (attempt ${attempt}/${maxRetries}), backing off...`,
      );
      if (attempt < maxRetries) {
        await sleep(10_000 * attempt);
        continue;
      }
      throw new Error(`runScan rate limited after ${maxRetries} attempts`);
    }

    // Server error — retry
    if (res.status >= 500) {
      console.warn(
        `[Scan] Server error ${res.status} (attempt ${attempt}/${maxRetries}): ${text.slice(0, 200)}`,
      );
      if (attempt < maxRetries) {
        await sleep(5_000 * attempt);
        continue;
      }
      throw new Error(
        `runScan REST failed (${res.status}): ${text.slice(0, 500)}`,
      );
    }

    // 400 config error — try to auto-fix by removing problematic tests
    if (res.status === 400) {
      console.warn(
        `[Scan] 400 error (attempt ${attempt}/${maxRetries}): ${text.slice(0, 300)}`,
      );
      const fixed = tryFixScanConfig(text, tests);
      if (fixed && attempt < maxRetries) {
        tests = fixed;
        console.log(
          `[Scan] Retrying with ${tests.length} tests after removing incompatible ones`,
        );
        continue;
      }
      // If we have many entrypoints and can't diagnose the issue,
      // try with fewer entrypoints (first half)
      if (eps.length > 5 && attempt < maxRetries) {
        const prev = eps.length;
        eps = eps.slice(0, Math.ceil(prev / 2));
        console.log(
          `[Scan] Retrying with ${eps.length} entrypoints (reduced from ${prev})`,
        );
        continue;
      }
    }

    throw new Error(
      `runScan REST failed (${res.status}): ${text.slice(0, 500)}`,
    );
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
    const filtered = tests.filter(
      (t) => !exclusiveTests.some((ex) => lower.includes(ex) || t === ex),
    );
    if (filtered.length < tests.length && filtered.length > 0) {
      console.log(
        `[Scan] Removed mutually exclusive test(s), ${tests.length} → ${filtered.length}`,
      );
      return filtered;
    }
  }

  // "multiple auth attack tests" — remove broken_access_control
  if (
    lower.includes("multiple auth attack tests") ||
    lower.includes("custom auth objects")
  ) {
    const filtered = tests.filter((t) => t !== "broken_access_control");
    if (filtered.length < tests.length && filtered.length > 0) {
      console.log(
        `[Scan] Removed multi-auth test(s), ${tests.length} → ${filtered.length}`,
      );
      return filtered;
    }
  }

  return null;
}

const TERMINAL_STATUSES = new Set([
  "done",
  "completed",
  "stopped",
  "failed",
  "disrupted",
]);

function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status.toLowerCase());
}

function isFailureStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === "failed" || s === "disrupted" || s === "timeout";
}

export { isFailureStatus };

export async function waitForScanCompletion(
  api: BrightApiContext,
  scanId: string,
  onProgress?: (status: string, issuesFound: number) => void,
  healthMonitor?: AppHealthMonitor,
): Promise<string> {
  const pollInterval = 30_000;
  let pausedByMonitor = false;

  // Initial wait before first poll
  await sleep(pollInterval);

  while (true) {
    // Reactive lifecycle control: pause the scan in Bright while the target
    // is unhealthy, resume it once recovery succeeds. Avoids burning scan
    // budget on requests that are doomed to fail with "target is down".
    if (healthMonitor) {
      const healthy = healthMonitor.isHealthy();
      if (!healthy && !pausedByMonitor) {
        const ok = await setScanLifecycle(api, scanId, "pause");
        if (ok) {
          pausedByMonitor = true;
          console.log(
            `[Scan] Paused ${scanId} — app unhealthy, will resume after recovery`,
          );
        }
      } else if (healthy && pausedByMonitor) {
        const ok = await setScanLifecycle(api, scanId, "resume");
        if (ok) {
          pausedByMonitor = false;
          console.log(`[Scan] Resumed ${scanId} — app healthy again`);
        }
      }
    }

    const scanStatus = await getScanStatusViaRest(
      api,
      scanId,
    );
    const issues = scanStatus.issuesFound;

    onProgress?.(scanStatus.status, issues);

    if (isTerminalStatus(scanStatus.status)) {
      console.log(`[Scan] Completed: ${scanStatus.status} (${issues} issues)`);
      return scanStatus.status.toLowerCase();
    }

    console.log(
      `[Scan] Status: ${scanStatus.status} (${issues} issues found so far)`,
    );
    await sleep(pollInterval);
  }
}

/**
 * Drive a scan's lifecycle (pause/resume/stop/run) via Bright's REST API.
 * Returns true on 2xx, false on any failure (logged but not thrown — callers
 * treat lifecycle control as best-effort).
 */
export async function setScanLifecycle(
  api: BrightApiContext,
  scanId: string,
  action: "pause" | "resume" | "stop" | "run",
): Promise<boolean> {
  const url = `https://${api.brightHostname}/api/v1/scans/${encodeURIComponent(scanId)}/lifecycle`;
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Api-Key ${api.brightToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `[Scan] Lifecycle ${action} for ${scanId} failed (${res.status}): ${body.slice(0, 200)}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      `[Scan] Lifecycle ${action} for ${scanId} threw: ${toErrorMessage(err)}`,
    );
    return false;
  }
}

async function getScanStatusViaRest(
  api: BrightApiContext,
  scanId: string,
): Promise<{ status: string; issuesFound: number }> {
  const url = `https://${api.brightHostname}/api/v1/scans/${encodeURIComponent(scanId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Api-Key ${api.brightToken}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `getScanStatus failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as Record<string, unknown>;

  const issuesFound = extractIssueCount(data);

  return {
    status: (data.status as string) ?? "unknown",
    issuesFound,
  };
}

/**
 * Extract total issue count from a scan REST response (ScanView schema).
 *
 * Primary: uses the per-severity top-level fields (current API):
 *   numberOfCriticalSeverityIssues, numberOfHighSeverityIssues,
 *   numberOfMediumSeverityIssues, numberOfLowSeverityIssues
 *
 * Secondary: issuesLength (total count field on ScanView).
 *
 * Tertiary: deprecated issuesBySeverity array where each item is
 *   { type: "Medium", number: 4, issuesByStatus: [...] }
 */
function extractIssueCount(data: Record<string, unknown>): number {
  const severityFields = [
    "numberOfCriticalSeverityIssues",
    "numberOfHighSeverityIssues",
    "numberOfMediumSeverityIssues",
    "numberOfLowSeverityIssues",
  ] as const;

  let total = 0;
  let hasSeverityFields = false;
  for (const field of severityFields) {
    if (typeof data[field] === "number") {
      total += data[field] as number;
      hasSeverityFields = true;
    }
  }
  if (hasSeverityFields) return total;

  if (typeof data.issuesLength === "number") return data.issuesLength;

  // Deprecated: issuesBySeverity is an array of { type, number, issuesByStatus }
  if (Array.isArray(data.issuesBySeverity)) {
    for (const item of data.issuesBySeverity) {
      if (
        typeof item === "object" &&
        item !== null &&
        typeof item.number === "number"
      ) {
        total += item.number;
      }
    }
    return total;
  }

  return 0;
}
