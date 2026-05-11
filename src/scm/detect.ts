/**
 * Repository URL parser and SCM platform auto-detection.
 *
 * Supported URL formats:
 *   GitHub:       https://github.com/owner/repo
 *   GitHub Ent:   https://ghe.example.com/owner/repo
 *   Azure DevOps: https://dev.azure.com/org/_git/repo
 *                 https://dev.azure.com/org/project/_git/repo
 */

import type { RepoInfo, ScmProvider } from "./types.js";
import { GitHubProvider } from "./github.js";
import { AzureDevOpsProvider } from "./azure-devops.js";

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

/**
 * Parse a repository URL into a RepoInfo with platform-specific coordinates.
 * Throws if the URL format is not recognized.
 */
export function parseRepositoryUrl(raw: string): RepoInfo {
  // Normalise: strip trailing slashes and .git suffix
  const cleaned = raw.replace(/\/+$/, "").replace(/\.git$/, "");

  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    throw new Error(
      `Invalid REPOSITORY_URL: "${raw}" — expected a full URL ` +
        `(e.g. https://github.com/owner/repo or https://dev.azure.com/org/_git/repo)`,
    );
  }

  // ---- Azure DevOps ----
  if (url.host === "dev.azure.com") {
    return parseAzureDevOpsUrl(url, raw);
  }

  // ---- GitHub (default for everything else) ----
  return parseGitHubUrl(url, raw);
}

function parseAzureDevOpsUrl(url: URL, raw: string): RepoInfo {
  // Path patterns:
  //   /org/_git/repo          (project === repo)
  //   /org/project/_git/repo
  const segments = url.pathname.split("/").filter(Boolean);
  const gitIdx = segments.indexOf("_git");

  if (gitIdx < 0 || gitIdx + 1 >= segments.length) {
    throw new Error(
      `Invalid Azure DevOps URL: "${raw}" — expected /_git/<repo> in the path`,
    );
  }

  const organization = segments[0];
  const repository = segments[gitIdx + 1];
  // If there's a segment between org and _git, that's the project
  const project = gitIdx > 1 ? segments[1] : repository;

  return {
    platform: "azure-devops",
    url: raw,
    organization,
    project,
    repository,
  };
}

function parseGitHubUrl(url: URL, raw: string): RepoInfo {
  // /owner/repo
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new Error(
      `Invalid GitHub URL: "${raw}" — expected /owner/repo in the path`,
    );
  }
  return {
    platform: "github",
    url: raw,
    owner: segments[0],
    repo: segments[1],
  };
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

/** Create the correct ScmProvider for the given RepoInfo. */
export function createScmProvider(info: RepoInfo): ScmProvider {
  switch (info.platform) {
    case "github":
      return new GitHubProvider(info);
    case "azure-devops":
      return new AzureDevOpsProvider(info);
    default:
      throw new Error(`Unsupported SCM platform: ${(info as RepoInfo).platform}`);
  }
}

/**
 * One-shot helper: parse a URL and return the matching provider.
 */
export function detectScmProvider(repositoryUrl: string): {
  info: RepoInfo;
  provider: ScmProvider;
} {
  const info = parseRepositoryUrl(repositoryUrl);
  const provider = createScmProvider(info);
  return { info, provider };
}
