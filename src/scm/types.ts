/**
 * SCM provider abstraction — decouples the engine from any specific
 * source-control platform (GitHub, Azure DevOps, GitLab in future).
 */

// ---------------------------------------------------------------------------
// Parsed repository coordinates
// ---------------------------------------------------------------------------

/** Platform-agnostic repository info extracted from a REPOSITORY_URL. */
export interface RepoInfo {
  /** Detected platform kind. */
  platform: "github" | "azure-devops";
  /** Original URL as supplied by the user. */
  url: string;

  // ---- GitHub ----
  /** GitHub owner (org or user). Undefined for non-GitHub. */
  owner?: string;
  /** GitHub repo name. Undefined for non-GitHub. */
  repo?: string;

  // ---- Azure DevOps ----
  /** Azure DevOps organization name. */
  organization?: string;
  /** Azure DevOps project name. */
  project?: string;
  /** Azure DevOps repository name. */
  repository?: string;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface ScmProvider {
  /** Human-readable platform name for logs. */
  readonly platformName: string;

  /** Build an authenticated HTTPS clone URL. */
  buildCloneUrl(token: string): string;

  /** Return the `owner/repo` (GitHub) or `org/project/repo` (Azure) slug for logs. */
  repoSlug(): string;

  /**
   * Validate that the token grants access to the repository.
   * Throws a descriptive error if the token is missing or unauthorized.
   */
  validateAccess(token: string): Promise<void>;

  /** Detect the default branch of the repository (e.g. "main"). */
  getDefaultBranch(token: string): Promise<string>;

  /** Find an existing open PR whose source branch matches `branch`. Returns the PR id/number or null. */
  findPullRequest(token: string, branch: string): Promise<number | null>;

  /** Create a new pull request. Returns the PR id/number or null on failure. */
  createPullRequest(
    token: string,
    head: string,
    base: string,
    title: string,
    body: string,
  ): Promise<number | null>;

  /** Update the description/body of an existing PR. */
  updatePullRequestBody(token: string, prId: number, body: string): Promise<void>;
}
