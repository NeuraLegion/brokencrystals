import type OpenAI from "openai";
import type { ChatCompletionTool } from "openai/resources/chat/completions.mjs";
import { chatWithTools, type ToolHandler } from "../inference.js";
import {
  codebaseTools,
  createToolHandler,
  webSearchTools,
  createWebSearchHandler,
  runCommandOnHostTool,
  runCommandInDockerTool,
  editFileTool,
  probeUrlTool,
  execInDocker,
  handleEditFile,
  handleProbeUrl,
} from "../tools.js";
import { extractJson, runShellCommand, formatTechStack } from "../utils.js";
import { scanPrepPrompt } from "../prompts/scan-prep.js";
import type { TechStack } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanPrepResult {
  completed: boolean;
  changes: string[];
  summary: string;
  /** Machine-readable reason for orchestration decisions. */
  failureKind?: "login_5xx" | "login_404" | "rate_limit" | "verification_missing" | "no_changes" | "parse_error" | "unknown";
  /** Docker commands that successfully modified settings — replayed on re-run */
  replayCommands?: { container: string; command: string }[];
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function prepareScanEnvironment(
  llm: OpenAI,
  repoPath: string,
  baseUrl: string,
  techStack: TechStack,
  model?: string,
  activeIssue?: string,
): Promise<ScanPrepResult> {
  console.log("[ScanPrep] Starting scan preparation phase — relaxing rate limits and security controls...");

  // Full tool set: codebase (read_file, list_files, search_files) + web search +
  // shell commands + docker exec + file editing + HTTP probing
  const tools: ChatCompletionTool[] = [
    ...codebaseTools,
    ...webSearchTools,
    runCommandOnHostTool,
    runCommandInDockerTool,
    editFileTool,
    probeUrlTool,
  ];

  const baseCodeHandler = createToolHandler(repoPath);
  const webHandler = createWebSearchHandler(repoPath);

  // Track docker commands that modify settings (for deterministic re-run)
  const dockerCommands: { container: string; command: string }[] = [];
  let editFileCalls = 0;
  let postProbeCalls = 0;
  const postProbeStatuses: number[] = [];
  let saw429 = false;

  const handler: ToolHandler = async (name, args) => {
    if (name === "run_command_on_host") {
      const cmd = String(args.command ?? "");
      console.log(`[ScanPrep] run_command_on_host: ${cmd.slice(0, 200)}`);
      return runShellCommand(repoPath, cmd, 120_000);
    }
    if (name === "run_command_in_docker") {
      const container = String(args.container ?? "");
      const cmd = String(args.command ?? "");
      console.log(`[ScanPrep] run_command_in_docker [${container}]: ${cmd.slice(0, 200)}`);
      const result = execInDocker(repoPath, container, cmd, 120_000);
      // Capture commands that set/modify settings (not read-only queries)
      if (/set\(|=\s*\d|=\s*true|=\s*false|update|disable|enable/i.test(cmd)) {
        dockerCommands.push({ container, command: cmd });
      }
      return result;
    }
    if (name === "edit_file") {
      editFileCalls += 1;
      return handleEditFile(repoPath, args);
    }
    if (name === "probe_url") {
      const method = String(args.method ?? "GET").toUpperCase();
      console.log(`[ScanPrep] probe_url: ${method} ${String(args.url ?? "")}`);
      const result = await handleProbeUrl(args);
      if (method === "POST") {
        postProbeCalls += 1;
        const statusMatch = result.match(/HTTP\s+(\d{3})\b/);
        if (statusMatch?.[1]) {
          postProbeStatuses.push(Number(statusMatch[1]));
        }
      }
      if (/HTTP\s+429\b/.test(result)) saw429 = true;
      return result;
    }
    if (name === "search_web" || name === "fetch_url") {
      return webHandler(name, args);
    }
    return baseCodeHandler(name, args);
  };

  const messages = scanPrepPrompt(baseUrl, formatTechStack(techStack), activeIssue);

  const response = await chatWithTools(llm, messages, tools, handler, model, 20);

  try {
    const json = extractJson(response);
    const result = JSON.parse(json) as {
      completed?: boolean;
      changes?: string[];
      summary?: string;
      reason?: string;
    };

    if (result.completed) {
      const changes = result.changes ?? [];
      const actualMutations = dockerCommands.length + editFileCalls;
      if (postProbeCalls < 5) {
        const summary = "Scan-prep reported success without performing the mandatory 5+ rapid POST verification";
        console.warn(`[ScanPrep] Failed: ${summary}`);
        return { completed: false, changes: [], summary, failureKind: "verification_missing" };
      }
      if (actualMutations === 0 && changes.length === 0) {
        const summary = "Scan-prep reported success without applying or documenting any rate-limit/security-control change";
        console.warn(`[ScanPrep] Failed: ${summary}`);
        return { completed: false, changes: [], summary, failureKind: "no_changes" };
      }
      if (saw429) {
        const summary = "Scan-prep verification still observed HTTP 429; rate limits were not fully relaxed";
        console.warn(`[ScanPrep] Failed: ${summary}`);
        return { completed: false, changes: [], summary, failureKind: "rate_limit" };
      }
      if (postProbeStatuses.length >= 5 && postProbeStatuses.every((status) => status === 404)) {
        const summary = "Scan-prep verification only observed HTTP 404 on login POSTs; this does not prove rate limits were relaxed";
        console.warn(`[ScanPrep] Failed: ${summary}`);
        return { completed: false, changes: [], summary, failureKind: "login_404" };
      }
      if (postProbeStatuses.length >= 5 && postProbeStatuses.every((status) => status >= 500)) {
        const summary = "Scan-prep verification only observed HTTP 5xx on login POSTs; the login path is crashing, not verified as scanner-ready";
        console.warn(`[ScanPrep] Failed: ${summary}`);
        return { completed: false, changes: [], summary, failureKind: "login_5xx" };
      }
      console.log(`[ScanPrep] Completed — ${changes.length} change(s): ${result.summary}`);
      for (const c of changes) {
        console.log(`[ScanPrep]   • ${c}`);
      }
      return { completed: true, changes, summary: result.summary ?? "Done", replayCommands: dockerCommands };
    }

    console.warn(`[ScanPrep] Failed: ${result.reason ?? result.summary ?? "unknown"}`);
    return { completed: false, changes: [], summary: result.reason ?? "Failed", failureKind: "unknown" };
  } catch (err) {
    console.warn(`[ScanPrep] Could not parse response: ${err}`);
    return { completed: false, changes: [], summary: `Parse error: ${err}`, failureKind: "parse_error" };
  }
}

// ---------------------------------------------------------------------------
// Deterministic replay — re-applies the exact commands that worked before
// ---------------------------------------------------------------------------

export function replayScanPrep(
  repoPath: string,
  commands: { container: string; command: string }[],
): { success: boolean; applied: number; failed: number } {
  console.log(`[ScanPrep] Replaying ${commands.length} previously-successful command(s)...`);
  let applied = 0;
  let failed = 0;
  for (const { container, command } of commands) {
    try {
      console.log(`[ScanPrep] replay [${container}]: ${command.slice(0, 200)}`);
      execInDocker(repoPath, container, command, 60_000);
      applied++;
    } catch (err) {
      console.warn(`[ScanPrep] replay failed: ${err}`);
      failed++;
    }
  }
  console.log(`[ScanPrep] Replay done — ${applied} applied, ${failed} failed`);
  return { success: failed === 0, applied, failed };
}
