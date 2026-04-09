/**
 * Platform abstraction: decouples the engine from any specific agent SDK.
 *
 * Uses GitHub REST API directly for PR description updates.
 * Progress is reported to stdout.
 */

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface JobDetails {
  id: string;
  repository: string;
  serverUrl: string;
  branchName: string;
  commitLogin: string;
  commitEmail: string;
  problemStatement: string;
  action: string;
}

export interface Platform {
  fetchJobDetails(): Promise<JobDetails>;
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

export function cloneRepository(opts: {
  serverUrl: string;
  repository: string;
  gitToken: string;
  branchName: string;
  commitLogin: string;
  commitEmail: string;
}): string {
  const host = new URL(opts.serverUrl).host;
  const cloneUrl = opts.gitToken
    ? `https://x-access-token:${opts.gitToken}@${host}/${opts.repository}.git`
    : `https://${host}/${opts.repository}.git`;
  const dest = `/tmp/workspace/${opts.repository}`;

  if (existsSync(dest)) {
    execFileSync("rm", ["-rf", dest]);
  }
  mkdirSync(dest, { recursive: true });

  // Clone with depth 2 so we have a parent commit for diffs
  execFileSync("git", [
    "clone", "--depth", "2", cloneUrl, dest,
  ], { stdio: "pipe", timeout: 120_000 });

  // Try to check out the branch, create it if it doesn't exist
  try {
    execFileSync("git", ["checkout", opts.branchName], { cwd: dest, stdio: "pipe" });
  } catch {
    execFileSync("git", ["checkout", "-b", opts.branchName], { cwd: dest, stdio: "pipe" });
  }

  // Configure git author
  execFileSync("git", ["config", "user.name", opts.commitLogin || "bright-agent"], { cwd: dest, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", opts.commitEmail || "bright-agent@users.noreply.github.com"], { cwd: dest, stdio: "pipe" });

  return dest;
}

export function gitCommitAndPush(repoPath: string, message: string): void {
  execFileSync("git", ["add", "-A"], { cwd: repoPath, stdio: "pipe" });

  // Check if there's anything to commit
  try {
    execFileSync("git", ["diff", "--cached", "--quiet"], { cwd: repoPath, stdio: "pipe" });
    // No changes staged
    return;
  } catch {
    // There are changes — proceed with commit
  }

  execFileSync("git", ["commit", "-m", message], { cwd: repoPath, stdio: "pipe" });
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
// GitHub REST API helpers
// ---------------------------------------------------------------------------

async function findPullRequestNumber(
  apiBase: string,
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<number | null> {
  const url = `${apiBase}/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=open&per_page=1`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const pulls = (await res.json()) as Array<{ number: number }>;
    return pulls.length > 0 ? pulls[0].number : null;
  } catch {
    return null;
  }
}

async function updatePullRequestBody(
  apiBase: string,
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
): Promise<void> {
  const url = `${apiBase}/repos/${owner}/${repo}/pulls/${prNumber}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    console.warn(`[Platform] Failed to update PR description: ${res.status} ${res.statusText}`);
  }
}

// ---------------------------------------------------------------------------
// Default implementation — logs to stdout, updates PR via GitHub API
// ---------------------------------------------------------------------------

export class DefaultPlatform implements Platform {
  private readonly job: JobDetails;
  private readonly gitToken: string | undefined;
  private readonly apiBase: string;
  private prNumber: number | null | undefined; // undefined = not looked up yet

  constructor(job: JobDetails) {
    this.job = job;
    this.gitToken = process.env.GITHUB_GIT_TOKEN ?? process.env.GIT_TOKEN ?? process.env.GITHUB_TOKEN;
    this.apiBase = job.serverUrl.replace(/\/$/, "").includes("github.com")
      ? "https://api.github.com"
      : `${job.serverUrl.replace(/\/$/, "")}/api/v3`;
  }

  async fetchJobDetails(): Promise<JobDetails> {
    return this.job;
  }

  async reportPhase(_phase: string, description: string, _turn: number): Promise<void> {
    console.log(`[Phase] ${description}`);
  }

  async reportDetail(_phase: string, toolName: string, detail: string, _turn: number): Promise<void> {
    console.log(`[Detail] ${toolName}: ${detail}`);
  }

  async reportError(message: string): Promise<void> {
    console.error(`[Error] ${message}`);
  }

  async reportPrDescription(description: string): Promise<void> {
    if (!this.gitToken) return;

    const [owner, repo] = this.job.repository.split("/");
    if (!owner || !repo) return;

    // Lazy-lookup the PR number on first call
    if (this.prNumber === undefined) {
      this.prNumber = await findPullRequestNumber(
        this.apiBase, this.gitToken, owner, repo, this.job.branchName,
      );
      if (this.prNumber) {
        console.log(`[Platform] Found PR #${this.prNumber} for branch ${this.job.branchName}`);
      } else {
        console.log(`[Platform] No open PR found for branch ${this.job.branchName}, skipping PR updates`);
      }
    }

    if (!this.prNumber) return;

    await updatePullRequestBody(this.apiBase, this.gitToken, owner, repo, this.prNumber, description);
  }
}

/**
 * Create the platform. Reads job details from environment variables.
 */
export async function createPlatform(): Promise<{ platform: Platform; job: JobDetails }> {
  const repo = process.env.GITHUB_REPOSITORY ?? process.env.REPO;
  if (!repo) {
    throw new Error("Missing GITHUB_REPOSITORY or REPO environment variable");
  }

  const job: JobDetails = {
    id: process.env.GITHUB_JOB_ID ?? `standalone-${Date.now()}`,
    repository: repo,
    serverUrl: process.env.GITHUB_SERVER_URL ?? "https://github.com",
    branchName: process.env.GITHUB_BRANCH ?? `bright-scan-${Date.now()}`,
    commitLogin: process.env.GIT_AUTHOR_NAME ?? "bright-agent",
    commitEmail: process.env.GIT_AUTHOR_EMAIL ?? "bright-agent@users.noreply.github.com",
    problemStatement: process.env.PROBLEM_STATEMENT ?? "Run a security scan and fix vulnerabilities",
    action: process.env.ACTION ?? "fix",
  };

  const platform = new DefaultPlatform(job);
  console.log("[Platform] Initialized (GitHub API for PR updates)");
  return { platform, job };
}
