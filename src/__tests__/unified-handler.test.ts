import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUnifiedToolHandler, buildToolDefs } from "../tools/unified.js";
import type { UnifiedToolHandlerOptions } from "../tools/unified.js";

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
      shellGuard: (cmd) => cmd.includes("rm") ? "blocked!" : null,
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

    const result = await handler("edit_file", { path: "nonexistent.txt", old_str: "a", new_str: "b" });
    expect(result).toContain("Error");
    // onEdit is called with args + result for observability
    expect(onEdit).toHaveBeenCalled();
  });

  it("returns error message for unrecognized tools", async () => {
    const handler = createUnifiedToolHandler("/tmp/test", {});
    const result = await handler("totally_fake_tool", {});
    expect(result.toLowerCase()).toContain("unknown tool");
  });
});
