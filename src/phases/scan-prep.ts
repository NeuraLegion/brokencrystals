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
      return execInDocker(repoPath, container, cmd, 120_000);
    }
    if (name === "edit_file") {
      return handleEditFile(repoPath, args);
    }
    if (name === "probe_url") {
      console.log(`[ScanPrep] probe_url: ${String(args.method ?? "GET")} ${String(args.url ?? "")}`);
      return handleProbeUrl(args);
    }
    if (name === "search_web" || name === "fetch_url") {
      return webHandler(name, args);
    }
    return baseCodeHandler(name, args);
  };

  const messages = scanPrepPrompt(baseUrl, formatTechStack(techStack));

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
      console.log(`[ScanPrep] Completed — ${changes.length} change(s): ${result.summary}`);
      for (const c of changes) {
        console.log(`[ScanPrep]   • ${c}`);
      }
      return { completed: true, changes, summary: result.summary ?? "Done" };
    }

    console.warn(`[ScanPrep] Failed: ${result.reason ?? result.summary ?? "unknown"}`);
    return { completed: false, changes: [], summary: result.reason ?? "Failed" };
  } catch (err) {
    console.warn(`[ScanPrep] Could not parse response: ${err}`);
    return { completed: false, changes: [], summary: `Parse error: ${err}` };
  }
}
