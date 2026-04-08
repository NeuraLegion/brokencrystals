import { commitAndPush } from "@github/copilot-engine-sdk";
import { execFileSync, type ChildProcess } from "child_process";
import treeKill from "tree-kill";
import type { OrchestratorContext, SecurityFix, Finding } from "./types.js";
import { ProgressReporter } from "./progress.js";
import { formatTechStack } from "./utils.js";
import { detectTechStack, discoverEndpoints } from "./phases/analyze.js";
import { startApplicationWithRetries, captureDockerLogs, type StartupResult } from "./phases/startup.js";
import { detectAndConfigureAuth, type AuthResult } from "./phases/auth.js";
import { registerEntrypoints, verifyEntrypointAuth, pruneDeadEntrypoints } from "./phases/entrypoints.js";
import { setupRepeater, type RepeaterHandle } from "./phases/repeater.js";
import { selectTestsPerEndpoint, type ScanGroup } from "./phases/test-selection.js";
import { runSecurityScan, waitForScanCompletion } from "./phases/scan.js";
import { fetchFindings } from "./phases/findings.js";
import { generateFixes, applyFixes } from "./phases/fix.js";
import { chatWithTools } from "./inference.js";
import { codebaseTools, createToolHandler } from "./tools.js";

const MAX_ITERATIONS = 5;
const MAX_FIX_REPAIR_ATTEMPTS = 2;

export async function runOrchestrator(ctx: OrchestratorContext): Promise<void> {
  const { repoPath, platform, llm, bright, config } = ctx;
  const progress = new ProgressReporter(platform);

  let appProcess: ChildProcess | undefined;
  let repeater: RepeaterHandle | undefined;
  const allScanIds: string[] = [];

  try {
    // ----- Phase 1: Analyze codebase -----
    await progress.phaseStart("analyze", "Analyzing repository for tech stack and HTTP endpoints");
    const techStack = await detectTechStack(llm, repoPath);
    await progress.phaseDetail(
      "analyze",
      "tech_stack",
      `Tech stack: ${formatTechStack(techStack)}`,
    );

    const endpoints = await discoverEndpoints(llm, repoPath, techStack);
    console.log(`[Analyze] Discovered ${endpoints.length} HTTP endpoints`);
    for (const ep of endpoints) {
      console.log(`[Analyze]   ${ep.method} ${ep.path}`);
    }
    await progress.phaseDetail(
      "analyze",
      "endpoints",
      `Found ${endpoints.length} HTTP endpoints`,
    );

    if (endpoints.length === 0) {
      await progress.phaseStart("done", "No HTTP endpoints found. Nothing to scan.");
      return;
    }

    // ----- Phase 2: Start the application -----
    await progress.phaseStart("startup", "Starting the application under test");
    const startup = await startApplicationWithRetries(llm, repoPath, techStack);
    appProcess = startup.process;
    const startupConfig = startup.config;
    const baseUrl = `http://localhost:${startupConfig.port}`;
    await progress.phaseDetail("startup", "app_running", `Application running at ${baseUrl}`);

    // ----- Phase 3: Setup Bright project + repeater -----
    await progress.phaseStart("setup", "Setting up Bright security scanner and Repeater");

    let projectId = config.brightProjectId;
    if (!projectId) {
      const projects = await bright.listProjects();
      projectId = projects[0]?.id;
    }
    if (!projectId) {
      throw new Error("No Bright project found. Set BRIGHT_PROJECT_ID or create a project at app.brightsec.com.");
    }
    console.log(`[Setup] Using Bright project: ${projectId}`);

    repeater = await setupRepeater(llm, bright, projectId, config.brightToken, config.brightHostname);
    await progress.phaseDetail("setup", "repeater", `Repeater connected: ${repeater.repeaterId}`);

    // ----- Phase 4: Auth configuration -----
    await progress.phaseStart("auth", "Detecting authentication requirements");
    const authResult = await detectAndConfigureAuth(
      llm,
      bright,
      repoPath,
      techStack,
      endpoints,
      projectId,
      baseUrl,
      repeater.repeaterId,
      config.brightToken,
      config.brightHostname,
    );
    await progress.phaseDetail(
      "auth",
      "auth_result",
      authResult.hasAuth
        ? `Auth configured: ${authResult.authObjectId}`
        : "No auth required",
    );

    // If auth was detected but failed to configure, abort — scans without auth are useless
    if (authResult.authFailed) {
      await progress.phaseStart(
        "done",
        "Authentication is required but could not be configured. Cannot run meaningful scans without working auth.",
      );
      return;
    }

    // ----- Phase 5: Register entrypoints -----
    await progress.phaseStart("entrypoints", "Registering API endpoints for scanning");

    // Filter out endpoints that could corrupt application state or break auth.
    // DELETE: can remove users/data. PUT/PATCH on user/account paths: fuzzing
    // email/password fields changes the authenticated user's credentials,
    // which disrupts every scan that relies on that auth object.
    const safeEndpoints = endpoints.filter((ep) => {
      const method = ep.method.toUpperCase();
      const pathLower = ep.path.toLowerCase();

      // Always skip DELETE — too destructive
      if (method === "DELETE") {
        console.log(`[Entrypoints] Skipping destructive endpoint: ${ep.method} ${ep.path}`);
        return false;
      }

      // Skip PUT/PATCH on user/account/profile mutation endpoints
      if ((method === "PUT" || method === "PATCH") && isUserMutationPath(pathLower)) {
        console.log(`[Entrypoints] Skipping user-mutation endpoint: ${ep.method} ${ep.path}`);
        return false;
      }

      // Skip any endpoint whose body contains password/credential fields
      // (regardless of method) — fuzzing these breaks auth
      if (ep.body && hasCredentialFields(ep.body)) {
        console.log(`[Entrypoints] Skipping credential-mutating endpoint: ${ep.method} ${ep.path}`);
        return false;
      }

      return true;
    });
    if (safeEndpoints.length < endpoints.length) {
      console.log(`[Entrypoints] Excluded ${endpoints.length - safeEndpoints.length} risky endpoint(s)`);
    }

    let entrypointIds = await registerEntrypoints(
      bright,
      projectId,
      safeEndpoints,
      baseUrl,
      repeater.repeaterId,
      authResult.authObjectId,
    );
    await progress.phaseDetail(
      "entrypoints",
      "registered",
      `Registered ${entrypointIds.length} entrypoints`,
    );

    // Verify auth is working by checking entrypoint responses
    if (authResult.hasAuth && entrypointIds.length > 0) {
      console.log(`[Entrypoints] Verifying auth on ${entrypointIds.length} registered entrypoint(s)...`);
      const check = await verifyEntrypointAuth(bright, projectId, entrypointIds[0]);
      if (check.ok) {
        console.log(`[Entrypoints] ✓ Auth verification passed — ${check.detail}`);
      } else {
        console.warn(`[Entrypoints] ✗ Auth verification failed — ${check.detail}`);
      }
    }

    // Prune entrypoints that returned 404 — they waste scan time
    if (entrypointIds.length > 0) {
      entrypointIds = await pruneDeadEntrypoints(
        bright,
        projectId,
        entrypointIds,
        config.brightToken,
        config.brightHostname,
      );
      await progress.phaseDetail(
        "entrypoints",
        "pruned",
        `${entrypointIds.length} live entrypoints after pruning 404s`,
      );
    }

    // ----- Phase 6–8: Scan → Fix → Validate loop -----
    if (entrypointIds.length === 0) {
      await progress.phaseStart(
        "done",
        "No entrypoints could be registered with Bright. Check MCP logs for validation errors.",
      );
      return;
    }

    // ----- Phase 6: Select relevant tests per endpoint -----
    await progress.phaseStart("test_selection", "Selecting relevant security tests per endpoint");
    const scanGroups = await selectTestsPerEndpoint(
      llm, bright, safeEndpoints, entrypointIds, techStack, authResult.hasAuth,
    );
    await progress.phaseDetail(
      "test_selection",
      "selected",
      `Created ${scanGroups.length} scan group(s) with per-endpoint test selection`,
    );

    const allFixes: SecurityFix[] = [];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const iterLabel = `${iteration + 1}/${MAX_ITERATIONS}`;

      // --- Scan all groups ---
      await progress.phaseStart(
        "scan",
        `Running security scans (pass ${iterLabel} — ${scanGroups.length} group(s))`,
      );

      const scanIds: string[] = [];
      for (const [gi, group] of scanGroups.entries()) {
        try {
          const scanId = await runSecurityScan(
            projectId,
            group.entrypointIds,
            repeater.repeaterId,
            group.tests,
            config.brightToken,
            config.brightHostname,
            `Engine Pass ${iteration + 1} — Group ${gi + 1}`,
            group.hasPathParams,
          );
          scanIds.push(scanId);
          allScanIds.push(scanId);
        } catch (err) {
          console.error(`[Scan] Failed to start scan for group ${gi + 1}: ${err}`);
        }
      }

      if (scanIds.length === 0) {
        await progress.phaseStart("scan_error", "All scan launches failed. Check MCP logs.");
        break;
      }

      // Wait for all scans to complete (in parallel)
      const scanResults = await Promise.allSettled(
        scanIds.map(async (scanId, si) => {
          console.log(`[Scan] Waiting for scan ${si + 1}/${scanIds.length}: ${scanId}`);
          const finalStatus = await waitForScanCompletion(bright, scanId, (status, issues) => {
            progress.phaseDetail("scan", "poll", `Scan ${si + 1}: ${status} — ${issues} issues`);
          });
          return finalStatus;
        }),
      );

      let anyFailed = false;
      for (const [si, result] of scanResults.entries()) {
        if (result.status === "rejected") {
          console.error(`[Scan] Error waiting for scan ${scanIds[si]}: ${result.reason}`);
          anyFailed = true;
        } else if (result.value === "failed" || result.value === "disrupted") {
          console.error(`[Scan] Scan ${scanIds[si]} ended with status: ${result.value}`);
          anyFailed = true;
        }
      }

      if (anyFailed) {
        await progress.phaseStart(
          "scan_error",
          `One or more scans failed on pass ${iterLabel}. Check Bright dashboard.`,
        );
        break;
      }

      // --- Fetch findings ---
      const findings = await fetchFindings(config.brightToken, config.brightHostname, scanIds);
      await progress.phaseDetail(
        "scan",
        "findings",
        `Found ${findings.length} vulnerabilities`,
      );

      if (findings.length === 0) {
        const msg =
          iteration === 0
            ? "No vulnerabilities found — application appears secure."
            : `All vulnerabilities resolved after ${iteration + 1} pass(es). ${allFixes.length} total fixes applied.`;
        await progress.phaseStart("done", msg);
        return;
      }

      // Last iteration is validation-only
      if (iteration === MAX_ITERATIONS - 1) {
        await progress.phaseStart(
          "done",
          `Reached ${MAX_ITERATIONS} passes. ${findings.length} vulnerabilities remain. ${allFixes.length} fixes were applied.`,
        );
        return;
      }

      // --- Fix ---
      await progress.phaseStart(
        "fix",
        `Generating fixes for ${findings.length} vulnerabilities (pass ${iterLabel})`,
      );

      const fixes = await generateFixes(
        llm,
        repoPath,
        techStack,
        findings,
        allFixes,
      );
      applyFixes(repoPath, fixes);
      allFixes.push(...fixes);

      // Commit & push
      console.log(`[Fix] Committing ${fixes.length} fixes for ${fixes.map((f) => f.files.map((ff) => ff.path)).flat().join(", ")}`);
      try {
        commitAndPush(
          repoPath,
          `fix: remediate ${fixes.length} security vulnerabilities (pass ${iteration + 1})`,
        );
        console.log(`[Fix] Committed and pushed ${fixes.length} fixes`);
      } catch (err) {
        console.error(`[Fix] commitAndPush failed:`, err);
        // Try manual git commit as fallback
        const { execFileSync } = await import("child_process");
        try {
          execFileSync("git", ["add", "-A"], { cwd: repoPath });
          execFileSync("git", ["commit", "-m", `fix: remediate ${fixes.length} security vulnerabilities (pass ${iteration + 1})`], { cwd: repoPath });
          execFileSync("git", ["push"], { cwd: repoPath });
          console.log("[Fix] Committed and pushed via git fallback");
        } catch (gitErr) {
          console.error("[Fix] Git fallback also failed:", gitErr);
        }
      }

      await progress.phaseDetail(
        "fix",
        "applied",
        `Applied ${fixes.length} fixes, restarting for validation...`,
      );

      // Restart application with fixed code — if it fails, diagnose and repair
      await killProcess(appProcess);
      let restarted = false;

      try {
        const restart = await startApplicationWithRetries(llm, repoPath, techStack, startupConfig);
        appProcess = restart.process;
        restarted = true;
      } catch (startupErr) {
        console.error(`[Fix] Application failed to start after fixes: ${startupErr}`);

        // Capture container logs to understand what broke
        const containerLogs = captureDockerLogs(repoPath);
        console.log(`[Fix] Container logs:\n${containerLogs.slice(0, 2000)}`);

        // Try to let the LLM diagnose and fix the broken fix
        for (let repair = 0; repair < MAX_FIX_REPAIR_ATTEMPTS; repair++) {
          console.log(`[Fix] Repair attempt ${repair + 1}/${MAX_FIX_REPAIR_ATTEMPTS}`);
          await progress.phaseDetail(
            "fix",
            "repair",
            `Fix broke the app — repair attempt ${repair + 1}`,
          );

          try {
            const repairFixes = await diagnoseAndRepairBrokenFix(
              llm, repoPath, techStack, containerLogs, fixes,
            );

            if (repairFixes.length > 0) {
              applyFixes(repoPath, repairFixes);
              allFixes.push(...repairFixes);

              // Commit the repair
              try {
                commitAndPush(
                  repoPath,
                  `fix: repair broken security fix (pass ${iteration + 1}, repair ${repair + 1})`,
                );
              } catch {
                try {
                  execFileSync("git", ["add", "-A"], { cwd: repoPath });
                  execFileSync("git", ["commit", "-m", `fix: repair broken security fix (pass ${iteration + 1}, repair ${repair + 1})`], { cwd: repoPath });
                  execFileSync("git", ["push"], { cwd: repoPath });
                } catch { /* ignore */ }
              }
            }

            // Try restart again
            const restart = await startApplicationWithRetries(llm, repoPath, techStack, startupConfig);
            appProcess = restart.process;
            restarted = true;
            console.log(`[Fix] Repair succeeded on attempt ${repair + 1}`);
            break;
          } catch (repairErr) {
            console.error(`[Fix] Repair attempt ${repair + 1} failed: ${repairErr}`);
          }
        }

        // If all repairs failed, revert the fix commit and try to restart with clean code
        if (!restarted) {
          console.log("[Fix] All repairs failed — reverting fix commit");
          await progress.phaseDetail("fix", "revert", "Reverting broken fix to restore app");
          try {
            execFileSync("git", ["revert", "--no-edit", "HEAD"], { cwd: repoPath });
            execFileSync("git", ["push"], { cwd: repoPath });
            console.log("[Fix] Reverted fix commit");
          } catch (revertErr) {
            console.error(`[Fix] Revert failed: ${revertErr}`);
            // Hard reset as last resort
            try {
              execFileSync("git", ["reset", "--hard", "HEAD~1"], { cwd: repoPath });
              execFileSync("git", ["push", "--force-with-lease"], { cwd: repoPath });
              console.log("[Fix] Hard-reset to before fix");
            } catch { /* give up */ }
          }

          try {
            const restart = await startApplicationWithRetries(llm, repoPath, techStack, startupConfig);
            appProcess = restart.process;
            restarted = true;
          } catch {
            console.error("[Fix] App still won't start even after revert — aborting");
            await progress.phaseStart(
              "done",
              `Applied fixes broke the application and could not be repaired. ${allFixes.length} fixes were attempted.`,
            );
            return;
          }
        }
      }
    }
  } finally {
    // Cleanup
    await killProcess(appProcess);
    await killProcess(repeater?.process);

    // Stop any scans that are still running
    await stopRunningScans(config.brightToken, config.brightHostname, allScanIds);

    // Delete the repeater from Bright to avoid stale entries
    if (repeater?.repeaterId) {
      await deleteRepeater(config.brightToken, config.brightHostname, repeater.repeaterId);
    }

    try {
      await bright.close();
    } catch {
      // Ignore
    }
  }
}

function killProcess(proc: ChildProcess | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (!proc || !proc.pid) {
      resolve();
      return;
    }
    treeKill(proc.pid, "SIGTERM", () => resolve());
  });
}

async function stopRunningScans(
  brightToken: string,
  brightHostname: string,
  scanIds: string[],
): Promise<void> {
  if (scanIds.length === 0) return;

  const headers = {
    Authorization: `Api-Key ${brightToken}`,
    "Content-Type": "application/json",
  };

  const results = await Promise.allSettled(
    scanIds.map(async (scanId) => {
      // Check current status first
      const statusRes = await fetch(
        `https://${brightHostname}/api/v1/scans/${encodeURIComponent(scanId)}`,
        { headers },
      );
      if (!statusRes.ok) return;

      const scan = (await statusRes.json()) as { status?: string };
      const active = ["pending", "running", "queued", "scheduled"];
      if (!scan.status || !active.includes(scan.status)) return;

      console.log(`[Cleanup] Stopping scan ${scanId} (status: ${scan.status})`);
      const stopRes = await fetch(
        `https://${brightHostname}/api/v1/scans/${encodeURIComponent(scanId)}/lifecycle`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({ action: "stop" }),
        },
      );

      if (stopRes.ok) {
        console.log(`[Cleanup] Scan ${scanId} stopped`);
      } else {
        console.warn(`[Cleanup] Failed to stop scan ${scanId}: ${stopRes.status}`);
      }
    }),
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.warn(`[Cleanup] ${failed.length} scan stop request(s) failed`);
  }
}

async function deleteRepeater(
  brightToken: string,
  brightHostname: string,
  repeaterId: string,
): Promise<void> {
  try {
    console.log(`[Cleanup] Deleting repeater ${repeaterId}`);
    const res = await fetch(
      `https://${brightHostname}/api/v1/repeaters/${encodeURIComponent(repeaterId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Api-Key ${brightToken}` },
      },
    );
    if (res.ok || res.status === 204) {
      console.log("[Cleanup] Repeater deleted");
    } else {
      console.warn(`[Cleanup] Failed to delete repeater: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error(`[Cleanup] Failed to delete repeater: ${err}`);
  }
}

async function diagnoseAndRepairBrokenFix(
  llm: Parameters<typeof chatWithTools>[0],
  repoPath: string,
  techStack: import("./types.js").TechStack,
  containerLogs: string,
  appliedFixes: SecurityFix[],
): Promise<SecurityFix[]> {
  const handleTool = createToolHandler(repoPath);
  const stackStr = formatTechStack(techStack);

  const fixSummary = appliedFixes
    .map((f) => `- ${f.vulnerability.name}: ${f.summary}\n  Files: ${f.files.map((ff) => ff.path).join(", ")}`)
    .join("\n");

  const messages: Parameters<typeof chatWithTools>[1] = [
    {
      role: "system",
      content: `You are a senior developer debugging a build/runtime failure.
The application (${stackStr}) was working before security fixes were applied, but now it fails to start.
You have tools to read files and search the codebase.
Your job: analyze the container logs, identify what the fix broke, and produce corrected files.`,
    },
    {
      role: "user",
      content: `The following security fixes were just applied, and now the application won't start:

${fixSummary}

Container logs showing the error:
\`\`\`
${containerLogs.slice(0, 4000)}
\`\`\`

Please:
1. Read the files that were modified by the fixes
2. Identify the syntax error, import error, or logic error introduced
3. Fix it while preserving the security improvement where possible

Respond with a JSON array of file fixes:
\`\`\`json
[
  {
    "path": "src/example.ts",
    "content": "...full corrected file content..."
  }
]
\`\`\``,
    },
  ];

  const response = await chatWithTools(llm, messages, codebaseTools, handleTool);

  try {
    const jsonStr = response.match(/```(?:json)?\s*\n?([\s\S]*?)```/)?.[1] ?? response;
    const parsed = JSON.parse(jsonStr);
    const files = Array.isArray(parsed) ? parsed : [];

    if (files.length === 0) return [];

    // Use a dummy Finding to satisfy the SecurityFix type
    const dummyFinding: import("./types.js").Finding = {
      id: "repair",
      name: "Build repair",
      severity: "High",
      url: "",
      method: "",
      details: "Repaired broken security fix",
      remedy: "",
      issueId: "repair",
    };

    return [{
      vulnerability: dummyFinding,
      summary: "Repaired broken security fix that prevented app startup",
      verified: false,
      files: files.map((f: { path: string; content: string }) => ({
        path: f.path,
        content: f.content,
      })),
    }];
  } catch {
    console.error("[Fix] Could not parse repair response");
    return [];
  }
}

// Patterns for paths that modify user identity / credentials.
// Fuzzing these endpoints changes the authenticated user's email/password,
// which breaks the auth object and disrupts all subsequent scans.
const USER_MUTATION_PATTERNS = [
  /\/users?\/me\b/,
  /\/users?\/profile\b/,
  /\/users?\/account\b/,
  /\/profile\b/,
  /\/account\b/,
  /\/settings\/password\b/,
  /\/change[_-]?password\b/,
  /\/reset[_-]?password\b/,
  /\/update[_-]?password\b/,
  /\/update[_-]?email\b/,
  /\/update[_-]?profile\b/,
  /\/users?\/\d+$/, // PUT /users/1
  /\/users?\/[^/]+\/password\b/,
];

function isUserMutationPath(pathLower: string): boolean {
  return USER_MUTATION_PATTERNS.some((re) => re.test(pathLower));
}

// Body field names that indicate credential mutation.
// If the scanner fuzzes these, auth breaks.
const CREDENTIAL_FIELD_RE = /\b(password|passwd|new_password|newPassword|currentPassword|current_password|oldPassword|old_password)\b/i;

function hasCredentialFields(body: string): boolean {
  return CREDENTIAL_FIELD_RE.test(body);
}
