import { describe, it, expect, vi } from "vitest";
import { ProgressReporter } from "../progress.js";
import type { Platform } from "../platform.js";

// Minimal Platform stub — ProgressReporter only calls these for reporting.
const stubPlatform = (): Platform =>
  ({
    reportPhase: vi.fn(async () => {}),
    reportDetail: vi.fn(async () => {}),
    reportError: vi.fn(async () => {}),
    reportPrDescription: vi.fn(async () => {}),
  }) as unknown as Platform;

describe("ProgressReporter phase-change hook (model-tier reset)", () => {
  it("fires onPhaseChange once for each distinct phase", async () => {
    const seen: string[] = [];
    const p = new ProgressReporter(stubPlatform(), (phase) => seen.push(phase));

    await p.phaseStart("startup", "a");
    await p.phaseStart("auth", "b");
    await p.phaseStart("scan", "c");

    expect(seen).toEqual(["startup", "auth", "scan"]);
  });

  it("does NOT fire again when the same phase is resumed", async () => {
    const seen: string[] = [];
    const p = new ProgressReporter(stubPlatform(), (phase) => seen.push(phase));

    await p.phaseStart("scan_prep", "try 1");
    await p.phaseStart("scan_prep", "try 2"); // resume — must not reset
    await p.phaseStart("auth", "auth");

    expect(seen).toEqual(["scan_prep", "auth"]);
  });

  it("fires only on FIRST entry of a loop phase, not on re-entry (scan -> fix -> scan)", async () => {
    // The scan/fix loop escalates across rounds on persistent findings, so the
    // reset must NOT fire on round 2+ — only the first time each phase runs.
    const seen: string[] = [];
    const p = new ProgressReporter(stubPlatform(), (phase) => seen.push(phase));

    await p.phaseStart("scan", "round 1");
    await p.phaseStart("fix", "round 1");
    await p.phaseStart("scan", "round 2"); // re-entry — must NOT reset
    await p.phaseStart("fix", "round 2"); // re-entry — must NOT reset

    expect(seen).toEqual(["scan", "fix"]);
  });

  it("works without a callback (no throw)", async () => {
    const p = new ProgressReporter(stubPlatform());
    await expect(p.phaseStart("startup", "x")).resolves.toBeUndefined();
  });
});
