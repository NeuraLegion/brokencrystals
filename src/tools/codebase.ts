import { execFileSync } from "child_process";
import { existsSync, readFileSync, statSync } from "fs";
import { glob } from "glob";
import type { ChatCompletionTool } from "openai/resources/chat/completions.mjs";
import { resolve } from "path";
import type { ToolHandler } from "../inference.js";
import { PROBE_RESPONSE_DIR } from "../utils.js";

export const codebaseTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file from the repository. Returns the full file text.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative file path from the repository root (e.g. src/app.ts)",
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
            description: 'Glob pattern relative to the repo root (e.g. "src/**/*.ts", "*.json")',
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
        "Search file contents for a pattern using grep. Returns matching lines with file paths and line numbers. Supports both fixed text and regex patterns.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search pattern (fixed text by default, or regex if regex=true)",
          },
          glob: {
            type: "string",
            description: 'Optional glob to restrict search to certain files (e.g. "*.ts")',
          },
          regex: {
            type: "boolean",
            description:
              "If true, treat query as a regular expression instead of fixed text. Useful for searching patterns like 'authenticate|authorize|login'.",
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
        const rawPath = String(args.path ?? "");
        // Allow absolute paths to probe response directory (saved by probe_url)
        const filePath = rawPath.startsWith("/") ? resolve(rawPath) : resolve(repoPath, rawPath);
        if (!filePath.startsWith(repoPath) && !filePath.startsWith(PROBE_RESPONSE_DIR + "/")) {
          return "Error: path traversal attempt blocked";
        }
        if (!existsSync(filePath)) {
          return `Error: file not found: ${args.path}`;
        }
        if (statSync(filePath).isDirectory()) {
          return `Error: path is a directory, not a file: ${args.path}`;
        }
        const content = readFileSync(filePath, "utf-8");
        if (content.length > 50_000) {
          return content.slice(0, 50_000) + "\n... [truncated at 50000 chars]";
        }
        return content;
      }

      case "list_files": {
        const pattern = String(args.pattern ?? "**/*");
        const files = await glob(pattern, {
          cwd: repoPath,
          nodir: true,
          ignore: ["node_modules/**", ".git/**", "dist/**", "build/**", "vendor/**", ".data/**"],
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
        const useRegex = args.regex === true;
        try {
          const grepArgs = [
            "-rn",
            "--binary-files=without-match",
            "--include",
            fileGlob ?? "*",
            "--exclude-dir=node_modules",
            "--exclude-dir=.git",
            "--exclude-dir=dist",
            "--exclude-dir=build",
            "--exclude-dir=vendor",
            "--exclude-dir=.data",
            "--exclude-dir=data",
            "--exclude=*.min.js",
            "--exclude=*.min.css",
            "--exclude=*.bundle.js",
            "--exclude=*.chunk.js",
            "--exclude=*.map",
            ...(useRegex ? ["-E"] : ["-F"]),
            "--",
            query,
            ".",
          ];
          const output = execFileSync("grep", grepArgs, {
            cwd: repoPath,
            encoding: "utf-8",
            maxBuffer: 1024 * 1024,
            timeout: 10_000,
          });
          const MAX_LINES = 100;
          const MAX_LINE_LENGTH = 500;
          const MAX_TOTAL_CHARS = 30_000;
          const rawLines = output.trim().split("\n");
          const totalCount = rawLines.length;
          const truncatedLines: string[] = [];
          let totalChars = 0;
          for (let i = 0; i < Math.min(totalCount, MAX_LINES); i++) {
            let line = rawLines[i];
            if (line.length > MAX_LINE_LENGTH) {
              line = line.slice(0, MAX_LINE_LENGTH) + "… [truncated]";
            }
            if (totalChars + line.length > MAX_TOTAL_CHARS) {
              truncatedLines.push(`... [output truncated at ${MAX_TOTAL_CHARS} chars]`);
              break;
            }
            truncatedLines.push(line);
            totalChars += line.length + 1;
          }
          if (totalCount > MAX_LINES) {
            truncatedLines.push(`... and ${totalCount - MAX_LINES} more matches`);
          }
          return truncatedLines.join("\n");
        } catch {
          return "No matches found.";
        }
      }

      default:
        return `Error: unknown tool ${name}`;
    }
  };
}
