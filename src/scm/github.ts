/**
 * GitHub SCM provider — implements ScmProvider for github.com
 * and GitHub Enterprise Server instances.
 */

import type { ScmProvider, RepoInfo } from "./types.js";

export class GitHubProvider implements ScmProvider {
  readonly platformName = "GitHub";
  private readonly info: RepoInfo;
  private readonly apiBase: string;

  constructor(info: RepoInfo) {
    this.info = info;
    const host = new URL(info.url).host;
    this.apiBase = host === "github.com"
      ? "https://api.github.com"
      : `https://${host}/api/v3`;
  }

  buildCloneUrl(token: string): string {
    const host = new URL(this.info.url).host;
    const slug = this.repoSlug();
    return token
      ? `https://x-access-token:${token}@${host}/${slug}.git`
      : `https://${host}/${slug}.git`;
  }

  repoSlug(): string {
    return `${this.info.owner}/${this.info.repo}`;
  }

  async validateAccess(token: string): Promise<void> {
    if (!token) {
      throw new Error(
        `Missing REPO_ACCESS_TOKEN — a GitHub Personal Access Token is required to clone and push to ${this.repoSlug()}.`,
      );
    }
    const { owner, repo } = this.info;
    const res = await fetch(`${this.apiBase}/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `REPO_ACCESS_TOKEN is invalid or lacks access to ${this.repoSlug()} (HTTP ${res.status}). ` +
          `Ensure the token has "repo" scope.`,
      );
    }
    if (res.status === 404) {
      throw new Error(
        `Repository ${this.repoSlug()} not found (HTTP 404). Check that REPOSITORY_URL is correct ` +
          `and the token has access to this repository.`,
      );
    }
    if (!res.ok) {
      throw new Error(
        `Failed to validate repository access for ${this.repoSlug()} (HTTP ${res.status}).`,
      );
    }
  }

  async getDefaultBranch(token: string): Promise<string> {
    const { owner, repo } = this.info;
    try {
      const res = await fetch(`${this.apiBase}/repos/${owner}/${repo}`, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (res.ok) {
        const data = (await res.json()) as { default_branch: string };
        return data.default_branch;
      }
    } catch { /* fallback */ }
    return "main";
  }

  async findPullRequest(
    token: string,
    branch: string,
  ): Promise<number | null> {
    const { owner, repo } = this.info;
    const url = `${this.apiBase}/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=open&per_page=1`;
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (!res.ok) return null;
      const pulls = (await res.json()) as Array<{ number: number }>;
      return pulls.length > 0 ? pulls[0].number : null;
    } catch {
      return null;
    }
  }

  async createPullRequest(
    token: string,
    head: string,
    base: string,
    title: string,
    body: string,
  ): Promise<number | null> {
    const { owner, repo } = this.info;
    const url = `${this.apiBase}/repos/${owner}/${repo}/pulls`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, body, head, base }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.warn(`[GitHub] Failed to create PR: ${res.status} ${text}`);
        return null;
      }
      const pr = (await res.json()) as { number: number };
      return pr.number;
    } catch (err) {
      console.warn(`[GitHub] Error creating PR: ${err}`);
      return null;
    }
  }

  async updatePullRequestBody(
    token: string,
    prId: number,
    body: string,
  ): Promise<void> {
    const { owner, repo } = this.info;
    const url = `${this.apiBase}/repos/${owner}/${repo}/pulls/${prId}`;
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
      console.warn(
        `[GitHub] Failed to update PR description: ${res.status} ${res.statusText}`,
      );
    }
  }
}
