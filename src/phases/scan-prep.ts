import type OpenAI from "openai";
import { chatWithTools } from "../inference.js";
import { scanPrepPrompt, scanPrepTwoFactorPrompt } from "../prompts/scan-prep.js";
import { buildToolDefs, createUnifiedToolHandler, execInDocker } from "../tools.js";
import type { TechStack } from "../types.js";
import { extractJson, formatTechStack } from "../utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanPrepResult {
  completed: boolean;
  changes: string[];
  summary: string;
  /** Machine-readable reason for orchestration decisions. */
  failureKind?:
    | "login_5xx"
    | "login_404"
    | "rate_limit"
    | "verification_missing"
    | "no_changes"
    | "parse_error"
    | "unknown";
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
  console.log(
    "[ScanPrep] Starting scan preparation phase — relaxing rate limits and security controls...",
  );

  // ----- Stage 1: Rate limits + security controls -----
  const rateLimitResult = await runScanPrepStage(
    llm,
    repoPath,
    baseUrl,
    techStack,
    model,
    activeIssue,
    "rate_limit",
    scanPrepPrompt(baseUrl, formatTechStack(techStack), activeIssue),
  );

  // ----- Stage 2: 2FA/MFA bypass -----
  console.log("[ScanPrep] Stage 2 — checking 2FA/MFA requirements...");
  const twoFaResult = await runScanPrepStage(
    llm,
    repoPath,
    baseUrl,
    techStack,
    model,
    undefined,
    "2fa",
    scanPrepTwoFactorPrompt(baseUrl, formatTechStack(techStack)),
  );

  // Merge results: rate-limit stage is authoritative for pass/fail,
  // but we append 2FA changes if any
  const mergedChanges = [...(rateLimitResult.changes ?? []), ...(twoFaResult.changes ?? [])];
  const mergedCommands = [
    ...(rateLimitResult.replayCommands ?? []),
    ...(twoFaResult.replayCommands ?? []),
  ];

  // If rate-limit stage failed, propagate that failure
  if (!rateLimitResult.completed) {
    return {
      ...rateLimitResult,
      changes: mergedChanges,
      replayCommands: mergedCommands.length > 0 ? mergedCommands : undefined,
    };
  }

  // Both succeeded (or 2FA was not relevant)
  const summary =
    twoFaResult.changes.length > 0
      ? `${rateLimitResult.summary}; 2FA: ${twoFaResult.summary}`
      : rateLimitResult.summary;

  return {
    completed: true,
    changes: mergedChanges,
    summary,
    replayCommands: mergedCommands.length > 0 ? mergedCommands : undefined,
  };
}

/**
 * Run a single scan-prep stage with tracking and validation.
 */
async function runScanPrepStage(
  llm: OpenAI,
  repoPath: string,
  baseUrl: string,
  techStack: TechStack,
  model: string | undefined,
  activeIssue: string | undefined,
  stageName: string,
  messages: import("openai/resources/chat/completions.mjs").ChatCompletionMessageParam[],
): Promise<ScanPrepResult> {
  const dockerCommands: { container: string; command: string }[] = [];
  let editFileCalls = 0;
  let postProbeCalls = 0;
  const postProbeStatuses: number[] = [];
  let saw429 = false;

  const handlerOpts = {
    label: "ScanPrep",
    enableShell: true,
    enableDocker: true,
    enableEdit: true,
    enableProbe: true,
    enableWeb: true,
    onDocker: (_container: string, cmd: string, _result: string) => {
      if (/set\(|=\s*\d|=\s*true|=\s*false|update|disable|enable/i.test(cmd)) {
        dockerCommands.push({ container: _container, command: cmd });
      }
    },
    onEdit: () => {
      editFileCalls += 1;
    },
    onProbe: (args: Record<string, unknown>, result: string) => {
      const method = String(args.method ?? "GET").toUpperCase();
      if (method === "POST") {
        postProbeCalls += 1;
        const statusMatch = result.match(/HTTP\s+(\d{3})\b/);
        if (statusMatch?.[1]) {
          postProbeStatuses.push(Number(statusMatch[1]));
        }
      }
      if (/HTTP\s+429\b/.test(result)) saw429 = true;
    },
  } as const;

  const tools = buildToolDefs(handlerOpts);
  const handler = createUnifiedToolHandler(repoPath, handlerOpts);

  const response = await chatWithTools(llm, messages, tools, handler, model, activeIssue ? 50 : 40);

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

      // For the 2FA stage, skip the strict POST-verification requirements
      if (stageName === "2fa") {
        console.log(
          `[ScanPrep:2FA] Completed — ${changes.length} change(s): ${result.summary ?? "done"}`,
        );
        for (const c of changes) console.log(`[ScanPrep:2FA]   • ${c}`);
        return {
          completed: true,
          changes,
          summary: result.summary ?? "Done",
          replayCommands: dockerCommands,
        };
      }

      // Rate-limit stage: strict verification
      if (postProbeCalls < 5) {
        const summary = `Scan-prep reported success after only ${postProbeCalls}/5 required rapid POST verification request(s)`;
        console.warn(`[ScanPrep] Failed: ${summary}`);
        return { completed: false, changes: [], summary, failureKind: "verification_missing" };
      }
      if (actualMutations === 0 && changes.length === 0) {
        const summary =
          "Scan-prep reported success without applying or documenting any rate-limit/security-control change";
        console.warn(`[ScanPrep] Failed: ${summary}`);
        return { completed: false, changes: [], summary, failureKind: "no_changes" };
      }
      if (saw429) {
        const summary =
          "Scan-prep verification still observed HTTP 429; rate limits were not fully relaxed";
        console.warn(`[ScanPrep] Failed: ${summary}`);
        return { completed: false, changes: [], summary, failureKind: "rate_limit" };
      }
      if (postProbeStatuses.length >= 5 && postProbeStatuses.every((status) => status === 404)) {
        const summary =
          "Scan-prep verification only observed HTTP 404 on login POSTs; this does not prove rate limits were relaxed";
        console.warn(`[ScanPrep] Failed: ${summary}`);
        return { completed: false, changes: [], summary, failureKind: "login_404" };
      }
      if (postProbeStatuses.length >= 5 && postProbeStatuses.every((status) => status >= 500)) {
        const summary =
          "Scan-prep verification only observed HTTP 5xx on login POSTs; the login path is crashing, not verified as scanner-ready";
        console.warn(`[ScanPrep] Failed: ${summary}`);
        return { completed: false, changes: [], summary, failureKind: "login_5xx" };
      }
      console.log(`[ScanPrep] Completed — ${changes.length} change(s): ${result.summary}`);
      for (const c of changes) {
        console.log(`[ScanPrep]   • ${c}`);
      }
      return {
        completed: true,
        changes,
        summary: result.summary ?? "Done",
        replayCommands: dockerCommands,
      };
    }

    const failureMessage = result.reason ?? result.summary ?? "unknown";
    console.warn(`[ScanPrep:${stageName}] Failed: ${failureMessage}`);
    return { completed: false, changes: [], summary: failureMessage, failureKind: "unknown" };
  } catch (err) {
    console.warn(`[ScanPrep:${stageName}] Could not parse response: ${err}`);
    return {
      completed: false,
      changes: [],
      summary: `Parse error: ${err}`,
      failureKind: "parse_error",
    };
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
