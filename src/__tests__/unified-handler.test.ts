import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedToolHandlerOptions } from "../tools/unified.js";
import { buildToolDefs, createUnifiedToolHandler } from "../tools/unified.js";

describe("buildToolDefs", () => {
  it("includes codebase tools by default", () => {
    const tools = buildToolDefs({});
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("read_file");
    expect(names).toContain("list_files");
    expect(names).toContain("search_files");
  });

  it("includes shell tools when enabled", () => {
    const tools = buildToolDefs({ enableShell: true });
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("run_command_on_host");
  });

  it("includes docker tools when enabled", () => {
    const tools = buildToolDefs({ enableDocker: true });
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("run_command_in_docker");
  });

  it("includes edit tools when enabled", () => {
    const tools = buildToolDefs({ enableEdit: true });
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("edit_file");
  });

  it("includes probe tool when enabled", () => {
    const tools = buildToolDefs({ enableProbe: true });
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("probe_url");
  });

  it("includes web tools when enabled", () => {
    const tools = buildToolDefs({ enableWeb: true });
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("search_web");
    expect(names).toContain("fetch_url");
  });

  it("includes hint tools when enabled", () => {
    const tools = buildToolDefs({ enableHints: true });
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("save_hint");
    expect(names).toContain("remove_hint");
    expect(names).toContain("get_hints");
  });

  it("does not include disabled tools", () => {
    const tools = buildToolDefs({});
    const names = tools.map((t) => t.function.name);
    expect(names).not.toContain("run_command_on_host");
    expect(names).not.toContain("run_command_in_docker");
    expect(names).not.toContain("edit_file");
    expect(names).not.toContain("probe_url");
    expect(names).not.toContain("search_web");
    expect(names).not.toContain("save_hint");
  });
});

describe("createUnifiedToolHandler", () => {
  it("calls shellGuard and blocks when it returns a message", async () => {
    const handler = createUnifiedToolHandler("/tmp/test", {
      enableShell: true,
      shellGuard: (cmd) => (cmd.includes("rm") ? "blocked!" : null),
    });

    const result = await handler("run_command_on_host", { command: "rm -rf /" });
    expect(result).toBe("blocked!");
  });

  it("calls customProbe when probe_url is invoked", async () => {
    const customProbe = vi.fn().mockResolvedValue("custom probe result");
    const handler = createUnifiedToolHandler("/tmp/test", {
      enableProbe: true,
      customProbe,
    });

    const result = await handler("probe_url", { url: "http://test.com" });
    expect(customProbe).toHaveBeenCalledWith({ url: "http://test.com" });
    expect(result).toBe("custom probe result");
  });

  it("calls onEdit hook even on error (for logging)", async () => {
    const onEdit = vi.fn();
    const handler = createUnifiedToolHandler("/tmp/test-nonexistent-path", {
      enableEdit: true,
      onEdit,
    });

    const result = await handler("edit_file", {
      path: "nonexistent.txt",
      old_str: "a",
      new_str: "b",
    });
    expect(result).toContain("Error");
    // onEdit is called with args + result for observability
    expect(onEdit).toHaveBeenCalled();
  });

  it("returns error message for unrecognized tools", async () => {
    const handler = createUnifiedToolHandler("/tmp/test", {});
    const result = await handler("totally_fake_tool", {});
    expect(result.toLowerCase()).toContain("unknown tool");
  });

  it("save_hint files into the provided HintStore under the LLM-supplied stage", async () => {
    const { HintStore } = await import("../hints.js");
    const hints = new HintStore();
    const onHint = vi.fn();
    const handler = createUnifiedToolHandler("/tmp/test", {
      enableHints: true,
      hints,
      onHint,
    });

    const result = await handler("save_hint", {
      hint: "OAuth token endpoint is /oauth/token",
      stage: "auth",
    });
    expect(result).toContain("auth");
    expect(hints.count("auth")).toBe(1);
    expect(onHint).toHaveBeenCalledWith("auth", "OAuth token endpoint is /oauth/token");
  });

  it("save_hint falls back to defaultStage when stage is omitted", async () => {
    const { HintStore } = await import("../hints.js");
    const hints = new HintStore();
    const handler = createUnifiedToolHandler("/tmp/test", {
      enableHints: true,
      hints,
      defaultStage: "scan_prep",
    });

    await handler("save_hint", { hint: "Throttler raised to 999999" });
    expect(hints.count("scan_prep")).toBe(1);
  });

  it("save_hint returns an error when stage is missing and no defaultStage is set", async () => {
    const { HintStore } = await import("../hints.js");
    const handler = createUnifiedToolHandler("/tmp/test", {
      enableHints: true,
      hints: new HintStore(),
    });
    const result = await handler("save_hint", { hint: "anything" });
    expect(result.toLowerCase()).toContain("stage is required");
  });

  it("get_hints with no arg returns a per-stage summary", async () => {
    const { HintStore } = await import("../hints.js");
    const hints = new HintStore();
    hints.add("auth", "auth fact");
    hints.add("infra", "infra fact");
    const handler = createUnifiedToolHandler("/tmp/test", {
      enableHints: true,
      hints,
    });
    const result = await handler("get_hints", {});
    expect(result).toContain("auth: 1 hint");
    expect(result).toContain("infra: 1 hint");
  });

  it("get_hints with a specific stage returns the formatted block", async () => {
    const { HintStore } = await import("../hints.js");
    const hints = new HintStore();
    hints.add("auth", "OAuth token endpoint is /oauth/token");
    const handler = createUnifiedToolHandler("/tmp/test", {
      enableHints: true,
      hints,
    });
    const result = await handler("get_hints", { stage: "auth" });
    expect(result).toContain("OAuth token endpoint");
    expect(result).toContain("### auth");
  });
});
