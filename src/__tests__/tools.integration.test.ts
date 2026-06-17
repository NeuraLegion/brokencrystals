import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createToolHandler } from "../tools/codebase.js";
import { buildToolDefs, createUnifiedToolHandler } from "../tools/unified.js";

let testDir: string;

beforeAll(() => {
  testDir = mkdtempSync(join(tmpdir(), "bright-agent-test-"));
  // Create a mini project structure
  mkdirSync(join(testDir, "src"));
  mkdirSync(join(testDir, "src/utils"));
  writeFileSync(join(testDir, "package.json"), '{"name": "test-app"}');
  writeFileSync(join(testDir, "src/index.ts"), 'export const main = () => console.log("hello");\n');
  writeFileSync(
    join(testDir, "src/utils/helper.ts"),
    "export function add(a: number, b: number) { return a + b; }\n",
  );
  writeFileSync(join(testDir, "src/big-file.ts"), "x".repeat(60_000) + "\n// end");
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("codebase tool handler (real filesystem)", () => {
  it("read_file returns file content", async () => {
    const handler = createToolHandler(testDir);
    const result = await handler("read_file", { path: "package.json" });
    expect(result).toBe('{"name": "test-app"}');
  });

  it("read_file truncates large files at 50K", async () => {
    const handler = createToolHandler(testDir);
    const result = await handler("read_file", { path: "src/big-file.ts" });
    expect(result.length).toBeLessThanOrEqual(50_100);
    expect(result).toContain("[truncated at 50000 chars]");
  });

  it("read_file blocks path traversal", async () => {
    const handler = createToolHandler(testDir);
    const result = await handler("read_file", { path: "../../../etc/passwd" });
    expect(result).toContain("Error");
    expect(result).toContain("traversal");
  });

  it("read_file returns error for nonexistent file", async () => {
    const handler = createToolHandler(testDir);
    const result = await handler("read_file", { path: "nope.txt" });
    expect(result).toContain("Error");
    expect(result).toContain("not found");
  });

  it("list_files lists project files", async () => {
    const handler = createToolHandler(testDir);
    const result = await handler("list_files", { pattern: "**/*.ts" });
    expect(result).toContain("src/index.ts");
    expect(result).toContain("src/utils/helper.ts");
    expect(result).toContain("src/big-file.ts");
  });

  it("list_files returns message for no matches", async () => {
    const handler = createToolHandler(testDir);
    const result = await handler("list_files", { pattern: "**/*.py" });
    expect(result).toContain("No files found");
  });

  it("search_files finds text in files", async () => {
    const handler = createToolHandler(testDir);
    const result = await handler("search_files", { query: "add" });
    expect(result).toContain("helper.ts");
    expect(result).toContain("add");
  });

  it("search_files returns no matches for gibberish", async () => {
    const handler = createToolHandler(testDir);
    const result = await handler("search_files", { query: "xyzzy_not_found_12345" });
    expect(result).toContain("No matches");
  });

  it("search_files truncates long lines at 500 chars", async () => {
    const handler = createToolHandler(testDir);
    // big-file.ts has a 60K char line
    const result = await handler("search_files", { query: "end" });
    // If the big file matches, each line should be <= 500 + truncation marker
    const lines = result.split("\n");
    for (const line of lines) {
      expect(line.length).toBeLessThan(600);
    }
  });
});

describe("unified handler (real filesystem)", () => {
  it("routes codebase tools correctly", async () => {
    const handler = createUnifiedToolHandler(testDir, { label: "Test" });
    const result = await handler("read_file", { path: "package.json" });
    expect(result).toBe('{"name": "test-app"}');
  });

  it("routes shell commands when enabled", async () => {
    const handler = createUnifiedToolHandler(testDir, {
      label: "Test",
      enableShell: true,
    });
    const result = await handler("run_command_on_host", { command: "echo hello" });
    expect(result.trim()).toBe("hello");
  });

  it("blocks shell commands when disabled", async () => {
    const handler = createUnifiedToolHandler(testDir, { label: "Test" });
    const result = await handler("run_command_on_host", { command: "echo hi" });
    expect(result.toLowerCase()).toContain("unknown tool");
  });

  it("edit_file works on real files", async () => {
    // Create a file to edit
    writeFileSync(join(testDir, "editable.txt"), "line1\nline2\nline3\n");
    const handler = createUnifiedToolHandler(testDir, {
      label: "Test",
      enableEdit: true,
    });
    const result = await handler("edit_file", {
      path: "editable.txt",
      old_string: "line2",
      new_string: "modified",
    });
    expect(result).toContain("Edited");

    // Verify via read
    const content = await handler("read_file", { path: "editable.txt" });
    expect(content).toContain("modified");
    expect(content).not.toContain("line2");
  });

  it("buildToolDefs with all options returns correct tool count", () => {
    const tools = buildToolDefs({
      enableShell: true,
      enableDocker: true,
      enableEdit: true,
      enableProbe: true,
      enableWeb: true,
      enableHints: true,
    });
    const names = tools.map((t) => t.function.name);
    // Codebase (3) + Shell (1) + Docker (1) + Edit (1) + Probe (1) + Web (2) + Hints (3: save/remove/get) = 12
    expect(names.length).toBe(12);
    expect(new Set(names).size).toBe(names.length); // no duplicates
    expect(names).toContain("save_hint");
    expect(names).toContain("remove_hint");
    expect(names).toContain("get_hints");
  });
});
