import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import type { ChatCompletionTool } from "openai/resources/chat/completions.mjs";
import type { ToolHandler } from "../inference.js";
import { runShellCommand, toErrorMessage } from "../utils.js";
import { codebaseTools } from "./codebase.js";
import { createDockerfileToolHandler } from "./docker.js";
import { verifyDockerImageTool } from "./docker.js";
import { createWebSearchHandler } from "./web.js";
import { probeUrl, probeUrlTool } from "./probe.js";

// ---------------------------------------------------------------------------
// Tool definitions
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

export const editFileTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "edit_file",
    description:
      "Make a targeted edit to a file by replacing an exact string match. Much safer than write_file for small changes — you don't need to rewrite the entire file. The old_string must match EXACTLY one occurrence in the file (including whitespace/indentation).",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Relative file path from the repository root (e.g. compose.yml, Dockerfile)",
        },
        old_string: {
          type: "string",
          description:
            "The exact string to find in the file. Must match exactly one occurrence. Include enough surrounding context (a few lines) to ensure uniqueness.",
        },
        new_string: {
          type: "string",
          description:
            "The replacement string. Can be empty to delete the matched text.",
        },
      },
      required: ["path", "old_string", "new_string"],
      additionalProperties: false,
    },
  },
};

export const runCommandOnHostTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "run_command_on_host",
    description:
      "Run a shell command on the HOST machine (not inside a Docker container). Use for host-level diagnostics (docker ps, docker logs, docker inspect, ls, cat), builds (docker build, docker compose build), or small file fixes (sed, chmod). Commands are killed after 120 seconds.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            'Host shell command (e.g. "docker logs myapp --tail 50", "docker build -t myapp .", "sed -i \'s/old/new/g\' config.yml")',
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
};

export const runCommandInDockerTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "run_command_in_docker",
    description:
      "Run a command INSIDE a Docker container. Use this to inspect the container environment, check what's installed, read logs, test commands, or create seed data. Automatically wraps the command with 'docker exec' (running container) or 'docker run --rm' (image). Commands are killed after 120 seconds.",
    parameters: {
      type: "object",
      properties: {
        container: {
          type: "string",
          description:
            'Container name/ID (for running containers) or image name (to start a temporary container). e.g. "bright-app-local", "myapp-web-1", "abc123def"',
        },
        command: {
          type: "string",
          description:
            'Command to run inside the container (e.g. "which pnpm", "rails runner \'User.create!(...)\'", "cat /app/config/database.yml", "ps aux")',
        },
      },
      required: ["container", "command"],
      additionalProperties: false,
    },
  },
};

const waitTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "wait",
    description:
      "Wait for a specified number of seconds. Use this when services need time to start up before checking again. Max 60 seconds.",
    parameters: {
      type: "object",
      properties: {
        seconds: {
          type: "number",
          description: "Number of seconds to wait (1-60)",
        },
      },
      required: ["seconds"],
      additionalProperties: false,
    },
  },
};

const saveHintTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "save_hint",
    description:
      "Save an important discovery or hint for the NEXT repair attempt. Use this when you learn something critical about how this application works (e.g. 'App reads DB settings from config/database.yml, not from DATABASE_URL', 'The app needs Redis on port 6379'). These hints survive across repair iterations so the next attempt doesn't have to rediscover the same facts.",
    parameters: {
      type: "object",
      properties: {
        hint: {
          type: "string",
          description:
            "A concise factual statement about the application's configuration, dependencies, or behavior. Should be actionable for the next repair attempt.",
        },
      },
      required: ["hint"],
      additionalProperties: false,
    },
  },
};

const removeHintTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "remove_hint",
    description:
      "Remove a previously saved hint that turned out to be WRONG or MISLEADING. Use this when you discover that a hint from a previous attempt led to a failure or was based on incorrect assumptions. Pass the exact hint text (or a substring) to remove it.",
    parameters: {
      type: "object",
      properties: {
        hint: {
          type: "string",
          description:
            "The exact text (or substring) of the hint to remove.",
        },
      },
      required: ["hint"],
      additionalProperties: false,
    },
  },
};

// ---------------------------------------------------------------------------
// Tool arrays
// ---------------------------------------------------------------------------

const searchWebTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "search_web",
    description: "Search the public web for technical solutions.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

const fetchUrlTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "fetch_url",
    description: "Fetch a web page and return its text content.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "URL to fetch" } },
      required: ["url"],
      additionalProperties: false,
    },
  },
};

/** Codebase tools + write_file + run_command_on_host + run_command_in_docker + wait + save_hint — for infrastructure repair */
export const infraTools: ChatCompletionTool[] = [
  ...codebaseTools,
  verifyDockerImageTool,
  writeFileTool,
  editFileTool,
  runCommandOnHostTool,
  runCommandInDockerTool,
  waitTool,
  probeUrlTool,
  searchWebTool,
  fetchUrlTool,
  saveHintTool,
  removeHintTool,
];

// ---------------------------------------------------------------------------
// Shared handler helpers
// ---------------------------------------------------------------------------

/**
 * Execute a command inside a Docker container.
 * Automatically detects whether `container` is a running container (→ docker exec)
 * or an image name (→ docker run --rm).
 */
export function execInDocker(
  repoPath: string,
  container: string,
  command: string,
  timeout = 120_000,
): string {
  const isRunning = (() => {
    try {
      const out = execSync(
        `docker inspect --format='{{.State.Running}}' ${JSON.stringify(container)} 2>/dev/null`,
        { encoding: "utf-8", timeout: 5_000 },
      ).trim();
      return out === "true";
    } catch {
      return false;
    }
  })();
  const prefix = isRunning
    ? `docker exec -i ${JSON.stringify(container)}`
    : `docker run --rm -i ${JSON.stringify(container)}`;
  const dockerCmd = `${prefix} sh <<'__BRIGHT_EOF__'\n${command}\n__BRIGHT_EOF__`;
  return runShellCommand(repoPath, dockerCmd, timeout);
}

/**
 * Handle an edit_file tool call — find-and-replace exactly one occurrence.
 */
export function handleEditFile(
  repoPath: string,
  args: Record<string, unknown>,
): string {
  const filePath = resolve(repoPath, String(args.path ?? ""));
  if (!filePath.startsWith(repoPath)) {
    return "Error: path traversal attempt blocked";
  }
  const oldStr = String(args.old_string ?? "");
  const newStr = String(args.new_string ?? "");
  if (!oldStr) return "Error: old_string is required";
  try {
    const existing = readFileSync(filePath, "utf-8");
    const count = existing.split(oldStr).length - 1;
    if (count === 0) {
      return `Error: old_string not found in ${args.path}. Make sure the string matches exactly (including whitespace and indentation).`;
    }
    if (count > 1) {
      return `Error: old_string found ${count} times in ${args.path}. Include more surrounding context to make it unique.`;
    }
    const updated = existing.replace(oldStr, newStr);
    writeFileSync(filePath, updated);
    return `Edited ${args.path}: replaced ${oldStr.length} chars with ${newStr.length} chars`;
  } catch (err) {
    return `Error editing file: ${toErrorMessage(err)}`;
  }
}

// ---------------------------------------------------------------------------
// Infrastructure tool handler
// ---------------------------------------------------------------------------

export function createInfraToolHandler(repoPath: string, onHint?: (hint: string) => void, onRemoveHint?: (hint: string) => void): ToolHandler {
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
          return `Error writing file: ${toErrorMessage(err)}`;
        }
      }

      case "edit_file":
        return handleEditFile(repoPath, args);

      case "run_command_on_host": {
        const command = String(args.command ?? "");
        if (/docker\s+compose\s+down\s+[^|]*-v/i.test(command) ||
            /docker-compose\s+down\s+[^|]*-v/i.test(command) ||
            /docker\s+volume\s+prune/i.test(command) ||
            /docker\s+system\s+prune/i.test(command)) {
          console.warn(`[Tool] BLOCKED destructive command in infra repair: ${command.slice(0, 120)}`);
          return `Error: "docker compose down -v" and volume prune commands are blocked. They destroy ALL volumes including healthy data. Instead, remove only the specific stale volume: "docker compose down && docker volume rm <volume_name> && docker compose up -d". Use "docker volume ls" to identify which volume to remove.`;
        }
        console.log(`[Tool] run_command_on_host: ${command.slice(0, 200)}`);
        return runShellCommand(repoPath, command, 120_000);
      }

      case "run_command_in_docker": {
        const container = String(args.container ?? "");
        const cmd = String(args.command ?? "");
        console.log(`[Tool] run_command_in_docker [${container}]: ${cmd.slice(0, 200)}`);
        return execInDocker(repoPath, container, cmd, 120_000);
      }

      case "wait": {
        const seconds = Math.min(60, Math.max(1, Number(args.seconds ?? 10)));
        console.log(`[Tool] wait: ${seconds}s`);
        await new Promise((r) => setTimeout(r, seconds * 1000));
        return `Waited ${seconds} seconds`;
      }

      case "save_hint": {
        const hint = String(args.hint ?? "").trim();
        if (!hint) return "Error: hint cannot be empty";
        console.log(`[Tool] save_hint: ${hint.slice(0, 200)}`);
        if (onHint) onHint(hint);
        return `Hint saved: "${hint.slice(0, 100)}". It will be available to the next repair attempt.`;
      }

      case "remove_hint": {
        const hint = String(args.hint ?? "").trim();
        if (!hint) return "Error: hint cannot be empty";
        console.log(`[Tool] remove_hint: ${hint.slice(0, 200)}`);
        if (onRemoveHint) onRemoveHint(hint);
        return `Hint removed (if it existed). Remaining hints will be shown to the next attempt.`;
      }

      case "probe_url": {
        return probeUrl(args);
      }

      case "search_web":
      case "fetch_url": {
        const webHandler = createWebSearchHandler(repoPath);
        return webHandler(name, args);
      }

      default:
        return baseHandler(name, args);
    }
  };
}
