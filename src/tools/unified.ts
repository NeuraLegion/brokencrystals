import type { ChatCompletionTool } from "openai/resources/chat/completions.mjs";
import type { ToolHandler } from "../inference.js";
import { runShellCommand } from "../utils.js";
import { codebaseTools, createToolHandler } from "./codebase.js";
import { probeUrl, probeUrlTool } from "./probe.js";
import { webSearchTools, createWebSearchHandler } from "./web.js";
import { verifyDockerImageTool, createDockerfileToolHandler } from "./docker.js";
import { execInDocker, handleEditFile, editFileTool, runCommandOnHostTool, runCommandInDockerTool } from "./infra.js";

// ---------------------------------------------------------------------------
// Unified tool handler — configurable handler covering all common tools.
// Each phase passes options + hooks instead of duplicating switch/if logic.
// ---------------------------------------------------------------------------

export interface UnifiedToolHandlerOptions {
  /** Label for log messages (e.g. "Setup", "ScanPrep", "Auth") */
  label: string;
  /** Enable run_command_on_host */
  enableShell?: boolean;
  /** Enable run_command_in_docker */
  enableDocker?: boolean;
  /** Enable edit_file */
  enableEdit?: boolean;
  /** Enable probe_url */
  enableProbe?: boolean;
  /** Enable search_web + fetch_url */
  enableWeb?: boolean;
  /** Enable save_hint + remove_hint */
  enableHints?: boolean;
  /** Enable verify_docker_image */
  enableDockerVerify?: boolean;
  /** Guard for shell commands — return error string to block, null to allow */
  shellGuard?: (command: string) => string | null;
  /** Called after a probe_url completes */
  onProbe?: (args: Record<string, unknown>, result: string) => void;
  /** Called after run_command_in_docker completes */
  onDocker?: (container: string, command: string, result: string) => void;
  /** Called after edit_file completes */
  onEdit?: (args: Record<string, unknown>, result: string) => void;
  /** Hint callbacks */
  onHint?: (hint: string) => void;
  onRemoveHint?: (hint: string) => void;
  /** Custom probe implementation (e.g. with cookie jar). If not set, uses default probeUrl. */
  customProbe?: (args: Record<string, unknown>) => Promise<string>;
}

/**
 * Build the tool definitions array matching the enabled options.
 */
export function buildToolDefs(opts: UnifiedToolHandlerOptions): ChatCompletionTool[] {
  const tools: ChatCompletionTool[] = [...codebaseTools];
  if (opts.enableDockerVerify) tools.push(verifyDockerImageTool);
  if (opts.enableEdit) tools.push(editFileTool);
  if (opts.enableShell) tools.push(runCommandOnHostTool);
  if (opts.enableDocker) tools.push(runCommandInDockerTool);
  if (opts.enableProbe) tools.push(probeUrlTool);
  if (opts.enableWeb) tools.push(...webSearchTools);
  if (opts.enableHints) {
    tools.push(saveHintTool, removeHintTool);
  }
  return tools;
}

/**
 * Create a unified tool handler based on options.
 * Returns a ToolHandler that routes tool calls to the appropriate implementation.
 * For tools not covered by options, falls back to codebase handler.
 */
export function createUnifiedToolHandler(
  repoPath: string,
  opts: UnifiedToolHandlerOptions,
): ToolHandler {
  const codeHandler = createToolHandler(repoPath);
  const webHandler = opts.enableWeb ? createWebSearchHandler(repoPath) : undefined;
  const dockerfileHandler = opts.enableDockerVerify ? createDockerfileToolHandler(repoPath) : undefined;

  return async (name: string, args: Record<string, unknown>) => {
    switch (name) {
      // --- Codebase tools (always on) ---
      case "read_file":
      case "list_files":
      case "search_files":
        return codeHandler(name, args);

      // --- Docker image verification ---
      case "verify_docker_image":
        if (!opts.enableDockerVerify || !dockerfileHandler) break;
        return dockerfileHandler(name, args);

      // --- Shell command ---
      case "run_command_on_host": {
        if (!opts.enableShell) break;
        const command = String(args.command ?? "");
        if (opts.shellGuard) {
          const blocked = opts.shellGuard(command);
          if (blocked) {
            console.warn(`[${opts.label}] BLOCKED command: ${command.slice(0, 120)}`);
            return blocked;
          }
        }
        console.log(`[${opts.label}] run_command_on_host: ${command.slice(0, 200)}`);
        return runShellCommand(repoPath, command, 120_000);
      }

      // --- Docker exec ---
      case "run_command_in_docker": {
        if (!opts.enableDocker) break;
        const container = String(args.container ?? "");
        const cmd = String(args.command ?? "");
        console.log(`[${opts.label}] run_command_in_docker [${container}]: ${cmd.slice(0, 200)}`);
        const result = execInDocker(repoPath, container, cmd, 120_000);
        if (opts.onDocker) opts.onDocker(container, cmd, result);
        return result;
      }

      // --- Edit file ---
      case "edit_file": {
        if (!opts.enableEdit) break;
        const result = handleEditFile(repoPath, args);
        if (opts.onEdit) opts.onEdit(args, result);
        return result;
      }

      // --- Probe URL ---
      case "probe_url": {
        if (!opts.enableProbe) break;
        const result = opts.customProbe
          ? await opts.customProbe(args)
          : await probeUrl(args);
        if (opts.onProbe) opts.onProbe(args, result);
        return result;
      }

      // --- Web search ---
      case "search_web":
      case "fetch_url": {
        if (!opts.enableWeb || !webHandler) break;
        return webHandler(name, args);
      }

      // --- Hints ---
      case "save_hint": {
        if (!opts.enableHints) break;
        const hint = String(args.hint ?? "").trim();
        if (!hint) return "Error: hint cannot be empty";
        console.log(`[${opts.label}] save_hint: ${hint.slice(0, 200)}`);
        if (opts.onHint) opts.onHint(hint);
        return `Hint saved: "${hint.slice(0, 100)}". It will be available to the next attempt.`;
      }

      case "remove_hint": {
        if (!opts.enableHints) break;
        const hint = String(args.hint ?? "").trim();
        if (!hint) return "Error: hint cannot be empty";
        console.log(`[${opts.label}] remove_hint: ${hint.slice(0, 200)}`);
        if (opts.onRemoveHint) opts.onRemoveHint(hint);
        return `Hint removed (if it existed).`;
      }

      // --- Wait ---
      case "wait": {
        const seconds = Math.min(60, Math.max(1, Number(args.seconds ?? 10)));
        console.log(`[${opts.label}] wait: ${seconds}s`);
        await new Promise((r) => setTimeout(r, seconds * 1000));
        return `Waited ${seconds} seconds`;
      }
    }

    return `Error: unknown tool ${name}`;
  };
}

// ---------------------------------------------------------------------------
// Hint tools (reused in buildToolDefs)
// ---------------------------------------------------------------------------

const saveHintTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "save_hint",
    description:
      "Save an important discovery or hint for the NEXT attempt. Use this when you learn something critical about how this application works.",
    parameters: {
      type: "object",
      properties: {
        hint: {
          type: "string",
          description:
            "A concise factual statement about the application's configuration, dependencies, or behavior.",
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
      "Remove a previously saved hint that turned out to be WRONG or MISLEADING.",
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
// Wait tool (used by infra handler, included here for completeness)
// ---------------------------------------------------------------------------

export const waitTool: ChatCompletionTool = {
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
