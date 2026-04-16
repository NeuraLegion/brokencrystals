import { readFileSync, existsSync, statSync, writeFileSync } from "fs";
import { resolve, relative } from "path";
import { glob } from "glob";
import { execFileSync, execSync } from "child_process";
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
        if (statSync(filePath).isDirectory()) {
          return `Error: path is a directory, not a file: ${args.path}`;
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
          return (
            files.slice(0, 200).join("\n") +
            `\n... and ${files.length - 200} more`
          );
        }
        return files.join("\n");
      }

      case "search_files": {
        const query = String(args.query ?? "");
        const fileGlob = args.glob ? String(args.glob) : undefined;
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
            "-F",
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
// Infrastructure repair tools — write_file + run_command for fixing scripts,
// compose files, configs, etc. between retry attempts.
// ---------------------------------------------------------------------------

const writeFileTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "write_file",
    description:
      "Write content to a file (create or overwrite). Use this to patch shell scripts, compose files, config files, etc.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Relative file path from the repository root (e.g. bin/docker/exec)",
        },
        content: {
          type: "string",
          description: "The full file content to write",
        },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
};

const runCommandTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "run_command",
    description:
      "Run a shell command in the repository directory and return its output. Use for diagnostics (docker logs, docker ps, ls, cat) or small fixes (sed, chmod). Commands are killed after 30 seconds.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            'Shell command to run (e.g. "docker logs discourse_dev --tail 50", "sed -i \'s/-it/-i/g\' bin/docker/exec")',
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
};

// infraTools is defined after verifyDockerImageTool below

export function createInfraToolHandler(repoPath: string): ToolHandler {
  const baseHandler = createDockerfileToolHandler(repoPath);
  return async (name: string, args: Record<string, unknown>) => {
    switch (name) {
      case "write_file": {
        const filePath = resolve(repoPath, String(args.path ?? ""));
        if (!filePath.startsWith(repoPath)) {
          return "Error: path traversal attempt blocked";
        }
        const content = String(args.content ?? "");
        try {
          writeFileSync(filePath, content);
          return `Written ${content.length} bytes to ${args.path}`;
        } catch (err) {
          return `Error writing file: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      case "run_command": {
        const command = String(args.command ?? "");
        // Block dangerous commands
        if (/\brm\s+-rf\s+[/~]|:\(\)\{|fork\s*bomb|mkfs|dd\s+if=/i.test(command)) {
          return "Error: dangerous command blocked";
        }
        try {
          const output = execSync(command, {
            cwd: repoPath,
            encoding: "utf-8",
            timeout: 30_000,
            maxBuffer: 5 * 1024 * 1024,
            stdio: ["pipe", "pipe", "pipe"],
          });
          const result = output.trim();
          return result.length > 10_000
            ? result.slice(-10_000) + "\n... [truncated]"
            : result || "(no output)";
        } catch (err) {
          if (err && typeof err === "object" && "stderr" in err) {
            const stderr = String((err as { stderr: unknown }).stderr).trim();
            const stdout = String((err as { stdout: unknown }).stdout).trim();
            return `Command failed:\n${stdout}\n${stderr}`.slice(-5_000);
          }
          return `Command failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      default:
        return baseHandler(name, args);
    }
  };
}

// ---------------------------------------------------------------------------
// Docker image verification tool
// ---------------------------------------------------------------------------

const verifyDockerImageTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "verify_docker_image",
    description:
      "Check if a Docker image:tag exists on Docker Hub. Use this BEFORE writing FROM lines to ensure the image tag is valid. Returns 'exists' or 'not found'.",
    parameters: {
      type: "object",
      properties: {
        image: {
          type: "string",
          description:
            'Full image reference (e.g. "node:22-bookworm-slim", "sbtscala/scala-sbt:eclipse-temurin-jammy-21.0.6_7_1.10.11_3.6.4")',
        },
      },
      required: ["image"],
      additionalProperties: false,
    },
  },
};

/** Codebase tools + write_file + run_command — for infrastructure repair between retries */
export const infraTools: ChatCompletionTool[] = [
  ...codebaseTools,
  verifyDockerImageTool,
  writeFileTool,
  runCommandTool,
];

/** Codebase tools + Docker image verification — for Dockerfile generation/repair */
export const dockerfileTools: ChatCompletionTool[] = [
  ...codebaseTools,
  verifyDockerImageTool,
];

/**
 * Check if a Docker image:tag exists on Docker Hub.
 * Uses the Docker Hub v2 API (no auth needed for public images).
 */
export async function verifyDockerImage(imageRef: string): Promise<boolean> {
  // Parse image:tag
  const [imagePart, tag = "latest"] = imageRef.split(":");
  // Official images are under library/
  const repo = imagePart.includes("/") ? imagePart : `library/${imagePart}`;

  const url = `https://hub.docker.com/v2/repositories/${repo}/tags/${tag}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    });
    return res.ok;
  } catch {
    // Network error or timeout — assume it exists to avoid false negatives
    return true;
  }
}

export function createDockerfileToolHandler(
  repoPath: string,
): ToolHandler {
  const baseHandler = createToolHandler(repoPath);
  return async (name: string, args: Record<string, unknown>) => {
    if (name === "verify_docker_image") {
      const image = String(args.image ?? "");
      if (!image) return "Error: image parameter is required";
      const exists = await verifyDockerImage(image);
      return exists ? `✓ Image "${image}" exists on Docker Hub` : `✗ Image "${image}" NOT FOUND on Docker Hub. Try a different tag.`;
    }
    return baseHandler(name, args);
  };
}

/**
 * Validate all FROM lines in a Dockerfile against Docker Hub.
 * Returns list of images that don't exist.
 */
export async function validateDockerfileImages(
  dockerfile: string,
): Promise<string[]> {
  const fromRe = /^FROM\s+(\S+)/gmi;
  const images = new Set<string>();
  let m;
  while ((m = fromRe.exec(dockerfile)) !== null) {
    const img = m[1];
    // Skip build args like $VARIANT and scratch
    if (img.startsWith("$") || img === "scratch") continue;
    // Skip AS aliases referenced in other FROM lines
    if (!img.includes("/") && !img.includes(":") && img === img.toLowerCase()) {
      // Could be an alias — skip single-word lowercase without colons
      // unless it looks like a known official image
      const officialPrefixes = ["node", "python", "golang", "ruby", "rust", "openjdk", "eclipse-temurin", "amazoncorretto", "maven", "gradle", "php", "nginx", "alpine", "ubuntu", "debian"];
      if (!officialPrefixes.some(p => img.startsWith(p))) continue;
    }
    images.add(img);
  }

  const missing: string[] = [];
  for (const img of images) {
    const exists = await verifyDockerImage(img);
    if (!exists) {
      missing.push(img);
      console.warn(`[Startup] Docker image not found: ${img}`);
    }
  }
  return missing;
}

// ---------------------------------------------------------------------------
// MCP tool helpers — convert MCP schemas to OpenAI format & dispatch calls
// ---------------------------------------------------------------------------

const CODEBASE_TOOL_NAMES = new Set([
  "read_file",
  "list_files",
  "search_files",
  "verify_docker_image",
]);

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
