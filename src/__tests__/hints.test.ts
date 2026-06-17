import { describe, expect, it } from "vitest";
import { ALL_STAGES, HintStore, isStage, parseLegacyHint } from "../hints.js";

describe("HintStore", () => {
  it("adds and reads back hints under a stage", () => {
    const store = new HintStore();
    expect(store.add("auth", "OAuth token endpoint at /oauth/token")).toBe(true);
    expect(store.count("auth")).toBe(1);
    expect(store.has("auth")).toBe(true);
    expect(store.get(["auth"])).toEqual([
      { stage: "auth", text: "OAuth token endpoint at /oauth/token" },
    ]);
  });

  it("dedups identical hints", () => {
    const store = new HintStore();
    store.add("auth", "the same fact");
    expect(store.add("auth", "the same fact")).toBe(false);
    expect(store.count("auth")).toBe(1);
  });

  it("dedups when one hint is a substring of another (either direction)", () => {
    const store = new HintStore();
    store.add("auth", "POST /login returns 200 with JSON body");
    expect(store.add("auth", "POST /login returns 200")).toBe(false);
    expect(store.add("auth", "POST /login returns 200 with JSON body and Set-Cookie")).toBe(false);
    expect(store.count("auth")).toBe(1);
  });

  it("ignores empty / whitespace-only hints", () => {
    const store = new HintStore();
    expect(store.add("auth", "")).toBe(false);
    expect(store.add("auth", "   ")).toBe(false);
    expect(store.count()).toBe(0);
  });

  it("truncates very long hints to 900 chars", () => {
    const store = new HintStore();
    const big = "x".repeat(2000);
    store.add("scan_prep", big);
    const hits = store.get(["scan_prep"]);
    expect(hits[0].text.length).toBe(900);
  });

  it("removes by exact text and by distinctive substring", () => {
    const store = new HintStore();
    store.add("auth", "OAuth token endpoint at /oauth/token");
    expect(store.remove("auth", "OAuth token endpoint at /oauth/token")).toBe(true);
    expect(store.count("auth")).toBe(0);

    store.add("auth", "Auth header is x-cal-client-id");
    expect(store.remove("auth", "x-cal-client-id")).toBe(true);
    expect(store.has("auth")).toBe(false);
  });

  it("returns false when removing from an empty stage", () => {
    const store = new HintStore();
    expect(store.remove("auth", "anything")).toBe(false);
  });

  it("count() with no arg sums all stages", () => {
    const store = new HintStore();
    store.add("auth", "fact 1");
    store.add("scan_prep", "fact 2");
    store.add("infra", "fact 3");
    expect(store.count()).toBe(3);
    expect(store.count("auth")).toBe(1);
  });

  it("stages() returns non-empty stages in canonical order", () => {
    const store = new HintStore();
    // Add out of canonical order
    store.add("scan", "scan fact");
    store.add("auth", "auth fact");
    store.add("startup", "startup fact");
    expect(store.stages()).toEqual(["startup", "auth", "scan"]);
  });

  it("get() with no filter returns every stage in canonical order", () => {
    const store = new HintStore();
    store.add("scan", "scan fact");
    store.add("auth", "auth fact");
    const all = store.get();
    expect(all.map((h) => h.stage)).toEqual(["auth", "scan"]);
  });

  it("format() produces a stage-grouped block, empty when nothing matches", () => {
    const store = new HintStore();
    expect(store.format()).toBe("");
    store.add("auth", "OAuth token endpoint at /oauth/token");
    store.add("scan_prep", "Throttler raised to 999999");
    const block = store.format();
    expect(block).toContain("## Saved hints");
    expect(block).toContain("### auth");
    expect(block).toContain("### scan_prep");
    expect(block).toContain("OAuth token endpoint");
    expect(block).toContain("Throttler raised to 999999");
  });

  it("format() honors a stage filter", () => {
    const store = new HintStore();
    store.add("auth", "auth fact");
    store.add("scan_prep", "scan_prep fact");
    const block = store.format(["auth"]);
    expect(block).toContain("auth fact");
    expect(block).not.toContain("scan_prep fact");
  });

  it("toLegacyArray() round-trips with fromLegacyArray()", () => {
    const original = [
      "[scan-prep] Rate limiting was relaxed",
      "[auth-test-url] Verified auth test URL is /v2/me",
      "[setup-credentials] user=bright_test pass=BrightTest123!",
      "[discovery] Postgres 18 with /var/lib/postgresql mount",
    ];
    const store = HintStore.fromLegacyArray(original);
    expect(store.count("scan_prep")).toBe(1);
    expect(store.count("auth")).toBe(1);
    expect(store.count("credentials")).toBe(1);
    expect(store.count("discovery")).toBe(1);
    const flat = store.toLegacyArray();
    // fromLegacyArray strips the original [tag] prefix, toLegacyArray reattaches
    // the canonical Stage tag — so round-trip preserves stage assignment but
    // not necessarily the original raw tag.
    expect(flat.some((s) => s.startsWith("[scan_prep]"))).toBe(true);
    expect(flat.some((s) => s.startsWith("[credentials]"))).toBe(true);
  });

  it("parseLegacyHint maps known prefixes correctly", () => {
    expect(parseLegacyHint("[auth-infra-skipped] foo").stage).toBe("infra");
    expect(parseLegacyHint("[auth] foo").stage).toBe("auth");
    expect(parseLegacyHint("[auth-test-url] foo").stage).toBe("auth");
    expect(parseLegacyHint("[scan-prep] foo").stage).toBe("scan_prep");
    expect(parseLegacyHint("[scan-prep-warning] foo").stage).toBe("scan_prep");
    expect(parseLegacyHint("[setup-credentials] foo").stage).toBe("credentials");
    expect(parseLegacyHint("[setup-infra-repair] foo").stage).toBe("infra");
    expect(parseLegacyHint("[setup] foo").stage).toBe("setup");
    expect(parseLegacyHint("[startup] foo").stage).toBe("startup");
    expect(parseLegacyHint("[entrypoints] foo").stage).toBe("entrypoints");
    expect(parseLegacyHint("[test-selection] foo").stage).toBe("test_selection");
    expect(parseLegacyHint("[fix] foo").stage).toBe("fix");
    expect(parseLegacyHint("[discovery] foo").stage).toBe("discovery");
  });

  it("parseLegacyHint falls back to 'discovery' for unknown / missing tags", () => {
    expect(parseLegacyHint("no tag at all").stage).toBe("discovery");
    expect(parseLegacyHint("[completely-unknown-tag] foo").stage).toBe("discovery");
  });

  it("isStage validates the Stage union", () => {
    for (const s of ALL_STAGES) {
      expect(isStage(s)).toBe(true);
    }
    expect(isStage("nope")).toBe(false);
    expect(isStage(123)).toBe(false);
    expect(isStage(undefined)).toBe(false);
  });
});
