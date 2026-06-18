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
import { resolve } from "path";
import { detectScmProvider } from "./scm/detect.js";
import type { ScmProvider } from "./scm/types.js";

/**
 * Convert an SSH/scp-style git remote into an https URL that the repository-URL
 * parser understands. Pass-through for URLs that are already http(s).
 *
 *   git@github.com:owner/repo.git        -> https://github.com/owner/repo
 *   ssh://git@github.com/owner/repo.git  -> https://github.com/owner/repo
 *   https://github.com/owner/repo.git    -> https://github.com/owner/repo
 */
export function normalizeRemoteUrl(raw: string): string {
  const url = raw.trim();
  // scp-style: user@host:path
  const scp = /^[\w.+-]+@([^:/]+):(.+)$/.exec(url);
  if (scp) {
    return `https://${scp[1]}/${scp[2].replace(/\.git$/, "")}`;
  }
  if (url.startsWith("ssh://")) {
    try {
      const u = new URL(url);
      return `https://${u.host}${u.pathname}`.replace(/\.git$/, "");
    } catch {
      /* fall through */
    }
  }
  return url.replace(/\.git$/, "");
}

/**
 * Resolve the local checkout to operate on. Defaults to the current working
 * directory; override with LOCAL_REPO_PATH. The agent runs against this working
 * copy directly — it does NOT clone.
 */
export function resolveRepoPath(): string {
  const repoPath = resolve(process.env.LOCAL_REPO_PATH ?? process.cwd());
  try {
    execFileSync("git", ["-C", repoPath, "rev-parse", "--is-inside-work-tree"], {
      stdio: "pipe",
    });
  } catch {
    throw new Error(
      `"${repoPath}" is not a git working tree. Check out the target repository ` +
        `before running Bright Agent (e.g. actions/checkout in CI), then run from ` +
        `inside it or set LOCAL_REPO_PATH.`,
    );
  }
  return repoPath;
}

/** Read the checkout's `origin` remote URL, normalized to https. */
export function deriveRepositoryUrl(repoPath: string): string {
  let origin = "";
  try {
    origin = execFileSync("git", ["-C", repoPath, "remote", "get-url", "origin"], {
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString()
      .trim();
  } catch {
    /* handled below */
  }
  if (!origin) {
    throw new Error(
      `Could not determine the repository URL from "${repoPath}". Set REPOSITORY_URL, ` +
        `or run inside a checkout that has an 'origin' remote.`,
    );
  }
  return normalizeRemoteUrl(origin);
}

/**
 * Prepare the local checkout for a scan run: create (or switch to) the scan
 * branch on top of the checked-out ref, set the commit author, and route pushes
 * through the access token so the fix branch and PR can be published.
 */
export function setupLocalRepo(opts: {
  repoPath: string;
  provider: ScmProvider;
  gitToken: string;
  branchName: string;
  commitLogin: string;
  commitEmail: string;
}): void {
  const { repoPath, branchName } = opts;

  // Create (or switch to) the scan branch on top of the current ref.
  try {
    execFileSync("git", ["-C", repoPath, "checkout", branchName], { stdio: "pipe" });
  } catch {
    execFileSync("git", ["-C", repoPath, "checkout", "-b", branchName], { stdio: "pipe" });
  }

  // Commit author for the fix commits.
  execFileSync("git", ["-C", repoPath, "config", "user.name", opts.commitLogin || "BrightSec"], {
    stdio: "pipe",
  });
  execFileSync(
    "git",
    ["-C", repoPath, "config", "user.email", opts.commitEmail || "bot@brightsec.com"],
    { stdio: "pipe" },
  );

  // Route pushes through the token so publishing works regardless of how the
  // checkout was authenticated. Leaves the fetch URL untouched.
  if (opts.gitToken) {
    try {
      const pushUrl = opts.provider.buildCloneUrl(opts.gitToken);
      execFileSync("git", ["-C", repoPath, "remote", "set-url", "--push", "origin", pushUrl], {
        stdio: "pipe",
      });
    } catch {
      // No 'origin' or unusual setup — fall back to the checkout's own auth.
    }
  }
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
   * Call this after setupLocalRepo() and before the orchestrator starts.
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
 * Create the platform for a local checkout. The SCM identity comes from
 * REPOSITORY_URL if set, otherwise from the checkout's `origin` remote.
 */
export async function createPlatform(
  gitToken: string | undefined,
  repoPath: string,
): Promise<{
  platform: Platform;
  job: JobDetails;
  provider: ScmProvider;
}> {
  const repositoryUrl = process.env.REPOSITORY_URL ?? deriveRepositoryUrl(repoPath);

  const { provider } = detectScmProvider(repositoryUrl);

  const job: JobDetails = {
    repository: provider.repoSlug(),
    branchName: process.env.BRANCH ?? `bright-scan-${Date.now()}`,
    commitLogin: process.env.GIT_AUTHOR_NAME ?? "BrightSec",
    commitEmail: process.env.GIT_AUTHOR_EMAIL ?? "bot@brightsec.com",
  };

  const platform = new DefaultPlatform(job, provider, gitToken);
  console.log(`[Platform] Initialized (${provider.platformName} — ${provider.repoSlug()})`);
  return { platform, job, provider };
}
