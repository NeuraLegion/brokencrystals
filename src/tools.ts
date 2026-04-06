import { readFileSync, existsSync } from "fs";
import { resolve, relative } from "path";
import { glob } from "glob";
import { execFileSync } from "child_process";
import type { ChatCompletionTool } from "openai/resources/chat/completions.mjs";
import type { ToolHandler } from "./inference.js";
import type { McpToolSchema, BrightMcpClient } from "./mcp-client.js";

export const codebaseTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read the contents of a file from the repository. Returns the full file text.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Relative file path from the repository root (e.g. src/app.ts)",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description:
        "List files matching a glob pattern in the repository. Returns newline-separated file paths.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description:
              'Glob pattern relative to the repo root (e.g. "src/**/*.ts", "*.json")',
          },
        },
        required: ["pattern"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description:
        "Search file contents for a text pattern using grep. Returns matching lines with file paths and line numbers.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search string (fixed text, not regex)",
          },
          glob: {
            type: "string",
            description:
              'Optional glob to restrict search to certain files (e.g. "*.ts")',
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
];

export function createToolHandler(repoPath: string): ToolHandler {
  return async (name: string, args: Record<string, unknown>) => {
    switch (name) {
      case "read_file": {
        const filePath = resolve(repoPath, String(args.path ?? ""));
        if (!filePath.startsWith(repoPath)) {
          return "Error: path traversal attempt blocked";
        }
        if (!existsSync(filePath)) {
          return `Error: file not found: ${args.path}`;
        }
        const content = readFileSync(filePath, "utf-8");
        if (content.length > 100_000) {
          return content.slice(0, 100_000) + "\n... [truncated]";
        }
        return content;
      }

      case "list_files": {
        const pattern = String(args.pattern ?? "**/*");
        const files = await glob(pattern, {
          cwd: repoPath,
          nodir: true,
          ignore: [
            "node_modules/**",
            ".git/**",
            "dist/**",
            "build/**",
            "vendor/**",
            ".data/**",
          ],
        });
        if (files.length === 0) return "No files found matching that pattern.";
        if (files.length > 200) {
          return files.slice(0, 200).join("\n") + `\n... and ${files.length - 200} more`;
        }
        return files.join("\n");
      }

      case "search_files": {
        const query = String(args.query ?? "");
        const fileGlob = args.glob ? String(args.glob) : undefined;
        try {
          const grepArgs = [
            "-rn",
            "--include",
            fileGlob ?? "*",
            "--exclude-dir=node_modules",
            "--exclude-dir=.git",
            "--exclude-dir=dist",
            "--exclude-dir=build",
            "--exclude-dir=vendor",
            "--exclude-dir=.data",
            "-F",
            query,
            ".",
          ];
          const output = execFileSync("grep", grepArgs, {
            cwd: repoPath,
            encoding: "utf-8",
            maxBuffer: 1024 * 1024,
            timeout: 10_000,
          });
          const lines = output.trim().split("\n");
          if (lines.length > 100) {
            return (
              lines.slice(0, 100).join("\n") +
              `\n... and ${lines.length - 100} more matches`
            );
          }
          return output.trim();
        } catch {
          return "No matches found.";
        }
      }

      default:
        return `Error: unknown tool ${name}`;
    }
  };
}

// ---------------------------------------------------------------------------
// MCP tool helpers — convert MCP schemas to OpenAI format & dispatch calls
// ---------------------------------------------------------------------------

const CODEBASE_TOOL_NAMES = new Set(["read_file", "list_files", "search_files"]);

export function convertMcpToolsToOpenAI(
  schemas: McpToolSchema[],
): ChatCompletionTool[] {
  return schemas.map((schema) => ({
    type: "function" as const,
    function: {
      name: schema.name,
      description: schema.description ?? schema.name,
      parameters: schema.inputSchema,
    },
  }));
}

export function createMcpToolHandler(bright: BrightMcpClient): ToolHandler {
  return async (name: string, args: Record<string, unknown>) => {
    return bright.callMcpToolRaw(name, args);
  };
}

export function combineToolHandlers(
  codebaseHandler: ToolHandler,
  mcpHandler: ToolHandler,
): ToolHandler {
  return async (name: string, args: Record<string, unknown>) => {
    if (CODEBASE_TOOL_NAMES.has(name)) {
      return codebaseHandler(name, args);
    }
    return mcpHandler(name, args);
  };
}
