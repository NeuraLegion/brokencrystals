/**
 * Azure DevOps SCM provider — implements ScmProvider for dev.azure.com.
 *
 * API docs: https://learn.microsoft.com/en-us/rest/api/azure/devops/git/
 * Authentication: Basic auth with PAT (username can be anything).
 */

import type { RepoInfo, ScmProvider } from "./types.js";

const API_VERSION = "7.1-preview.1";

export class AzureDevOpsProvider implements ScmProvider {
  readonly platformName = "Azure DevOps";
  private readonly info: RepoInfo;
  private readonly apiBase: string;
  /** Whether the original URL included an explicit project segment. */
  private readonly hasExplicitProject: boolean;

  constructor(info: RepoInfo) {
    this.info = info;
    this.hasExplicitProject = info.project !== info.repository;
    const { organization, project, repository } = info;
    this.apiBase = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}`;
  }

  buildCloneUrl(token: string): string {
    const { organization, project, repository } = this.info;
    // Preserve original URL format: /org/_git/repo vs /org/project/_git/repo
    const path = this.hasExplicitProject
      ? `${organization}/${project}/_git/${repository}`
      : `${organization}/_git/${repository}`;
    return token ? `https://x-pat:${token}@dev.azure.com/${path}` : `https://dev.azure.com/${path}`;
  }

  repoSlug(): string {
    const { organization, project, repository } = this.info;
    return `${organization}/${project}/${repository}`;
  }

  private authHeaders(token: string): Record<string, string> {
    const basic = Buffer.from(`:${token}`).toString("base64");
    return {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    };
  }

  async validateAccess(token: string): Promise<void> {
    if (!token) {
      throw new Error(
        `Missing REPO_ACCESS_TOKEN — an Azure DevOps Personal Access Token is required to clone and push to ${this.repoSlug()}.`,
      );
    }
    const res = await fetch(`${this.apiBase}?api-version=${API_VERSION}`, {
      headers: this.authHeaders(token),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `REPO_ACCESS_TOKEN is invalid or lacks access to ${this.repoSlug()} (HTTP ${res.status}). ` +
          `Ensure the PAT has "Code (Read & Write)" scope.`,
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
    try {
      const res = await fetch(`${this.apiBase}?api-version=${API_VERSION}`, {
        headers: this.authHeaders(token),
      });
      if (res.ok) {
        const data = (await res.json()) as { defaultBranch: string };
        // Azure returns "refs/heads/main" — strip the prefix
        return data.defaultBranch.replace(/^refs\/heads\//, "");
      }
    } catch {
      /* fallback */
    }
    return "main";
  }

  async findPullRequest(token: string, branch: string): Promise<number | null> {
    const url =
      `${this.apiBase}/pullrequests` +
      `?searchCriteria.sourceRefName=refs/heads/${branch}` +
      `&searchCriteria.status=active` +
      `&$top=1` +
      `&api-version=${API_VERSION}`;
    try {
      const res = await fetch(url, { headers: this.authHeaders(token) });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        value: Array<{ pullRequestId: number }>;
      };
      return data.value.length > 0 ? data.value[0].pullRequestId : null;
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
    const url = `${this.apiBase}/pullrequests?api-version=${API_VERSION}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: this.authHeaders(token),
        body: JSON.stringify({
          sourceRefName: `refs/heads/${head}`,
          targetRefName: `refs/heads/${base}`,
          title,
          description: body,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.warn(`[AzureDevOps] Failed to create PR: ${res.status} ${text}`);
        return null;
      }
      const pr = (await res.json()) as { pullRequestId: number };
      return pr.pullRequestId;
    } catch (err) {
      console.warn(`[AzureDevOps] Error creating PR: ${err}`);
      return null;
    }
  }

  async updatePullRequestBody(token: string, prId: number, body: string): Promise<void> {
    const url = `${this.apiBase}/pullrequests/${prId}?api-version=${API_VERSION}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: this.authHeaders(token),
      body: JSON.stringify({ description: body }),
    });
    if (!res.ok) {
      console.warn(
        `[AzureDevOps] Failed to update PR description: ${res.status} ${res.statusText}`,
      );
    }
  }
}
