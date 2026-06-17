/**
 * Platform abstraction: decouples the engine from any specific agent SDK.
 *
 * SCM operations (PRs, clone URLs) are delegated to the ScmProvider
 * (see src/scm/). Progress is reported to stdout.
 */

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface JobDetails {
  /** Repository slug for logs (e.g. "owner/repo" or "org/project/repo"). */
  repository: string;
  branchName: string;
  commitLogin: string;
  commitEmail: string;
}

export interface Platform {
  fetchJobDetails(): Promise<JobDetails>;
  initPr(repoPath: string): Promise<void>;
  reportPhase(phase: string, description: string, turn: number): Promise<void>;
  reportDetail(phase: string, toolName: string, detail: string, turn: number): Promise<void>;
  reportError(message: string): Promise<void>;
  reportPrDescription(description: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Git helpers (replace SDK's cloneRepo / commitAndPush / finalizeChanges)
// ---------------------------------------------------------------------------

import { execFileSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { detectScmProvider } from "./scm/detect.js";
import type { ScmProvider } from "./scm/types.js";

export function cloneRepository(opts: {
  provider: ScmProvider;
  gitToken: string;
  branchName: string;
  commitLogin: string;
  commitEmail: string;
}): string {
  const cloneUrl = opts.provider.buildCloneUrl(opts.gitToken);
  const slug = opts.provider.repoSlug();
  const dest = `/tmp/workspace/${slug}`;

  if (existsSync(dest)) {
    execFileSync("rm", ["-rf", dest]);
  }
  mkdirSync(dest, { recursive: true });

  // Clone with depth 2 so we have a parent commit for diffs
  execFileSync("git", ["clone", "--depth", "2", cloneUrl, dest], {
    stdio: "pipe",
    timeout: 120_000,
  });

  // Try to check out the branch, create it if it doesn't exist
  try {
    execFileSync("git", ["checkout", opts.branchName], {
      cwd: dest,
      stdio: "pipe",
    });
  } catch {
    execFileSync("git", ["checkout", "-b", opts.branchName], {
      cwd: dest,
      stdio: "pipe",
    });
  }

  // Configure git author
  execFileSync("git", ["config", "user.name", opts.commitLogin || "BrightSec"], {
    cwd: dest,
    stdio: "pipe",
  });
  execFileSync("git", ["config", "user.email", opts.commitEmail || "bot@brightsec.com"], {
    cwd: dest,
    stdio: "pipe",
  });

  return dest;
}

export function gitCommitAndPush(repoPath: string, message: string): void {
  execFileSync("git", ["add", "-A"], { cwd: repoPath, stdio: "pipe" });

  // Check if there's anything to commit
  try {
    execFileSync("git", ["diff", "--cached", "--quiet"], {
      cwd: repoPath,
      stdio: "pipe",
    });
    // No changes staged
    return;
  } catch {
    // There are changes — proceed with commit
  }

  execFileSync("git", ["commit", "-m", message], {
    cwd: repoPath,
    stdio: "pipe",
  });
  execFileSync("git", ["push"], { cwd: repoPath, stdio: "pipe" });
}

export function gitFinalizeChanges(repoPath: string, message: string): void {
  try {
    gitCommitAndPush(repoPath, message);
  } catch {
    // Non-fatal — just log
    console.log("[Git] No uncommitted changes to finalize, or push failed.");
  }
}

// ---------------------------------------------------------------------------
// Default implementation — logs to stdout, delegates PR ops to ScmProvider
// ---------------------------------------------------------------------------

export class DefaultPlatform implements Platform {
  private readonly job: JobDetails;
  private readonly gitToken: string | undefined;
  private readonly provider: ScmProvider;
  private prNumber: number | null | undefined; // undefined = not looked up yet

  constructor(job: JobDetails, provider: ScmProvider, gitToken?: string) {
    this.job = job;
    this.gitToken = gitToken;
    this.provider = provider;
  }

  /**
   * Push the branch and create a PR so progress updates have somewhere to go.
   * Call this after cloneRepository() and before the orchestrator starts.
   */
  async initPr(repoPath: string): Promise<void> {
    if (!this.gitToken) return;

    // Push the branch to origin — create an initial commit so the PR has a diff
    try {
      execFileSync(
        "git",
        ["commit", "--allow-empty", "-m", "chore: initialize Bright security scan"],
        {
          cwd: repoPath,
          stdio: "pipe",
        },
      );
      execFileSync("git", ["push", "-u", "origin", this.job.branchName], {
        cwd: repoPath,
        stdio: "pipe",
      });
      console.log(`[Platform] Pushed branch ${this.job.branchName}`);
    } catch (err) {
      const msg = String(err);
      if (
        msg.includes("Authentication failed") ||
        msg.includes("Invalid username or token") ||
        msg.includes("could not read Username")
      ) {
        throw new Error(
          `[Platform] Git authentication failed — check your REPO_ACCESS_TOKEN. The scan cannot push results without valid credentials.`,
        );
      }
      console.warn(`[Platform] Failed to push branch: ${err}`);
      return;
    }

    // Check if a PR already exists for this branch
    this.prNumber = await this.provider.findPullRequest(this.gitToken, this.job.branchName);

    if (!this.prNumber) {
      const baseBranch = await this.provider.getDefaultBranch(this.gitToken);

      this.prNumber = await this.provider.createPullRequest(
        this.gitToken,
        this.job.branchName,
        baseBranch,
        `🛡️ Bright Security Scan`,
        `## 🛡️ Bright Security Scan\n\n🔄 **Initializing...**`,
      );
    }

    if (this.prNumber) {
      console.log(`[Platform] PR #${this.prNumber} ready for progress updates`);
    } else {
      console.warn(`[Platform] Could not create PR — progress will only appear in logs`);
    }
  }

  async fetchJobDetails(): Promise<JobDetails> {
    return this.job;
  }

  async reportPhase(_phase: string, description: string, _turn: number): Promise<void> {
    console.log(`[Phase] ${description}`);
  }

  async reportDetail(
    _phase: string,
    toolName: string,
    detail: string,
    _turn: number,
  ): Promise<void> {
    console.log(`[Detail] ${toolName}: ${detail}`);
  }

  async reportError(message: string): Promise<void> {
    console.error(`[Platform] ${message}`);
  }

  async reportPrDescription(description: string): Promise<void> {
    if (!this.gitToken || !this.prNumber) return;

    await this.provider.updatePullRequestBody(this.gitToken, this.prNumber, description);
  }
}

/**
 * Create the platform. Reads job details from environment variables.
 * Auto-detects SCM platform (GitHub / Azure DevOps) from REPOSITORY_URL.
 */
export async function createPlatform(gitToken?: string): Promise<{
  platform: Platform;
  job: JobDetails;
}> {
  const repositoryUrl = process.env.REPOSITORY_URL;
  if (!repositoryUrl) {
    throw new Error("Missing REPOSITORY_URL environment variable");
  }

  const { provider } = detectScmProvider(repositoryUrl);

  const job: JobDetails = {
    repository: provider.repoSlug(),
    branchName: process.env.BRANCH ?? `bright-scan-${Date.now()}`,
    commitLogin: process.env.GIT_AUTHOR_NAME ?? "BrightSec",
    commitEmail: process.env.GIT_AUTHOR_EMAIL ?? "bot@brightsec.com",
  };

  const platform = new DefaultPlatform(job, provider, gitToken);
  console.log(`[Platform] Initialized (${provider.platformName} — ${provider.repoSlug()})`);
  return { platform, job };
}
