import type { ChatCompletionTool } from "openai/resources/chat/completions.mjs";
import type { ToolHandler } from "../inference.js";
import { runShellCommand } from "../utils.js";
import { codebaseTools, createToolHandler } from "./codebase.js";
import { probeUrl, probeUrlTool } from "./probe.js";
import { webSearchTools, createWebSearchHandler } from "./web.js";
import { verifyDockerImageTool, createDockerfileToolHandler } from "./docker.js";
import { execInDocker, handleEditFile, editFileTool, runCommandOnHostTool, runCommandInDockerTool } from "./infra.js";
import { ALL_STAGES, isStage, STAGE_DESCRIPTIONS, type HintStore, type Stage } from "../hints.js";

// ---------------------------------------------------------------------------
// Unified tool handler — configurable handler covering all common tools.
// Each phase passes options + hooks instead of duplicating switch/if logic.
// ---------------------------------------------------------------------------

export interface UnifiedToolHandlerOptions {
  /** Label for log messages (e.g. "Setup", "ScanPrep", "Auth") */
  label?: string;
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
  /** Enable save_hint + remove_hint + get_hints */
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
  /**
   * Optional shared HintStore. When provided, save_hint/remove_hint/get_hints
   * read and write here directly. Phases can also pass `onHint`/`onRemoveHint`
   * for side effects (logging into a per-phase array, progress events, etc.).
   */
  hints?: HintStore;
  /**
   * Default stage to file hints under when the LLM omits the `stage`
   * argument. Each phase should set this to its own stage so naive
   * `save_hint("foo")` calls land in a sensible bucket.
   */
  defaultStage?: Stage;
  /** Hint callbacks. Stage is whatever the LLM provided or `defaultStage`. */
  onHint?: (stage: Stage, hint: string) => void;
  onRemoveHint?: (stage: Stage, hint: string) => void;
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
    tools.push(saveHintTool, removeHintTool, getHintsTool);
  }
  return tools;
}

/**
 * Resolve the `stage` argument from a tool call. Falls back to `defaultStage`
 * (set by the phase) when the LLM omits or mistypes it. Returns `null` when
 * neither is available so the handler can return a clean error instead of
 * silently filing into the wrong bucket.
 */
function resolveStage(
  args: Record<string, unknown>,
  defaultStage?: Stage,
): Stage | null {
  const raw = args.stage;
  if (typeof raw === "string" && isStage(raw)) return raw;
  if (defaultStage) return defaultStage;
  return null;
}

/**
 * Shared dispatcher for save_hint / remove_hint / get_hints. Both
 * `createUnifiedToolHandler` and `createInfraToolHandler` route through
 * this so there's a single source of truth for the hint tool behavior.
 *
 * Returns the response string the tool should hand back, or `null` when
 * the tool name is not a hint tool (the caller should keep dispatching).
 */
export interface HintToolDispatchOptions {
  hints?: HintStore;
  defaultStage?: Stage;
  label?: string;
  onHint?: (stage: Stage, hint: string) => void;
  onRemoveHint?: (stage: Stage, hint: string) => void;
}

export function handleHintTool(
  name: string,
  args: Record<string, unknown>,
  opts: HintToolDispatchOptions,
): string | null {
  const label = opts.label ?? "Tool";
  switch (name) {
    case "save_hint": {
      const hint = String(args.hint ?? "").trim();
      if (!hint) return "Error: hint cannot be empty";
      const stage = resolveStage(args, opts.defaultStage);
      if (!stage) {
        return `Error: stage is required. Available stages: ${ALL_STAGES.join(", ")}`;
      }
      const stored = opts.hints?.add(stage, hint) ?? false;
      console.log(`[${label}] save_hint [${stage}]: ${hint.slice(0, 200)}`);
      if (opts.onHint) opts.onHint(stage, hint);
      return stored
        ? `Hint saved under stage "${stage}". It will be available to the next attempt.`
        : `Hint already covered by an existing entry under stage "${stage}" (no change).`;
    }
    case "remove_hint": {
      const hint = String(args.hint ?? "").trim();
      if (!hint) return "Error: hint cannot be empty";
      const stage = resolveStage(args, opts.defaultStage);
      if (!stage) {
        return `Error: stage is required. Available stages: ${ALL_STAGES.join(", ")}`;
      }
      const removed = opts.hints?.remove(stage, hint) ?? false;
      console.log(`[${label}] remove_hint [${stage}]: ${hint.slice(0, 200)}`);
      if (opts.onRemoveHint) opts.onRemoveHint(stage, hint);
      return removed
        ? `Hint removed from stage "${stage}".`
        : `No matching hint found in stage "${stage}".`;
    }
    case "get_hints": {
      const store = opts.hints;
      if (!store) return "No hints available (hint store not configured for this phase).";
      const stageArg = args.stage;
      if (stageArg == null || stageArg === "" || stageArg === "all") {
        const stages = store.stages();
        if (stages.length === 0) return "No hints saved yet.";
        const lines = stages.map((s) => `- ${s}: ${store.count(s)} hint(s) — ${STAGE_DESCRIPTIONS[s]}`);
        return [
          `Available hint stages (${stages.length} of ${ALL_STAGES.length} populated):`,
          ...lines,
          "",
          'Call get_hints with stage="<name>" to read a specific stage, or stage="all" for everything.',
        ].join("\n");
      }
      if (typeof stageArg === "string" && isStage(stageArg)) {
        const block = store.format([stageArg], `## Hints for stage "${stageArg}"`);
        return block || `No hints saved for stage "${stageArg}" yet.`;
      }
      return `Error: unknown stage "${String(stageArg)}". Available stages: ${ALL_STAGES.join(", ")}`;
    }
  }
  return null;
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
            console.warn(`[${opts.label ?? "Tool"}] BLOCKED command: ${command.slice(0, 120)}`);
            return blocked;
          }
        }
        console.log(`[${opts.label ?? "Tool"}] run_command_on_host: ${command.slice(0, 200)}`);
        return runShellCommand(repoPath, command, 120_000);
      }

      // --- Docker exec ---
      case "run_command_in_docker": {
        if (!opts.enableDocker) break;
        const container = String(args.container ?? "");
        const cmd = String(args.command ?? "");
        console.log(`[${opts.label ?? "Tool"}] run_command_in_docker [${container}]: ${cmd.slice(0, 200)}`);
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

      // --- Hints (delegated to the shared dispatcher) ---
      case "save_hint":
      case "remove_hint":
      case "get_hints": {
        if (!opts.enableHints) break;
        const out = handleHintTool(name, args, {
          hints: opts.hints,
          defaultStage: opts.defaultStage,
          label: opts.label,
          onHint: opts.onHint,
          onRemoveHint: opts.onRemoveHint,
        });
        if (out !== null) return out;
        break;
      }

      // --- Wait ---
      case "wait": {
        const seconds = Math.min(60, Math.max(1, Number(args.seconds ?? 10)));
        console.log(`[${opts.label ?? "Tool"}] wait: ${seconds}s`);
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

const stageEnumDescription = ALL_STAGES
  .map((s) => `"${s}" — ${STAGE_DESCRIPTIONS[s]}`)
  .join(" | ");

export const saveHintTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "save_hint",
    description:
      "Save a concise factual hint discovered during this attempt so it carries into the NEXT attempt or sibling phase. " +
      "Each hint is filed under a stage bucket. Pick the stage that BEST describes what the hint applies to. " +
      `Available stages: ${stageEnumDescription}`,
    parameters: {
      type: "object",
      properties: {
        hint: {
          type: "string",
          description:
            "A concise factual statement (≤900 chars) about the application's configuration, dependencies, or behavior.",
        },
        stage: {
          type: "string",
          enum: [...ALL_STAGES],
          description:
            "Which stage bucket to file this hint under. If omitted, the calling phase's default stage is used.",
        },
      },
      required: ["hint"],
      additionalProperties: false,
    },
  },
};

export const removeHintTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "remove_hint",
    description:
      "Remove a previously saved hint that turned out to be WRONG or MISLEADING. Pass the exact hint text or a distinctive substring.",
    parameters: {
      type: "object",
      properties: {
        hint: {
          type: "string",
          description:
            "Exact text or distinctive substring of the hint to remove.",
        },
        stage: {
          type: "string",
          enum: [...ALL_STAGES],
          description:
            "Which stage bucket to remove from. If omitted, the calling phase's default stage is used.",
        },
      },
      required: ["hint"],
      additionalProperties: false,
    },
  },
};

export const getHintsTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_hints",
    description:
      "List which hint stages are populated, or read the hints in a specific stage. " +
      "Call with no arguments (or stage='all') to see counts per stage; call with stage='<name>' to read that stage's hints. " +
      `Available stages: ${ALL_STAGES.join(", ")}.`,
    parameters: {
      type: "object",
      properties: {
        stage: {
          type: "string",
          enum: [...ALL_STAGES, "all"],
          description:
            "Stage bucket to read. Omit (or use 'all') to get a summary of every stage with hint counts.",
        },
      },
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
