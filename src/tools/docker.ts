import type { ChatCompletionTool } from "openai/resources/chat/completions.mjs";
import type { ToolHandler } from "../inference.js";
import { FETCH_TIMEOUT_DEFAULT } from "../utils.js";
import { codebaseTools, createToolHandler } from "./codebase.js";

export const verifyDockerImageTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "verify_docker_image",
    description:
      "Check if a Docker image:tag exists on Docker Hub. Use this BEFORE writing FROM lines to ensure the image tag is valid. Returns 'exists' or 'not found'.",
    parameters: {
      type: "object",
      properties: {
        image: {
          type: "string",
          description:
            'Full image reference (e.g. "node:22-bookworm-slim", "sbtscala/scala-sbt:eclipse-temurin-jammy-21.0.6_7_1.10.11_3.6.4")',
        },
      },
      required: ["image"],
      additionalProperties: false,
    },
  },
};

/** Codebase tools + Docker image verification — for Dockerfile generation/repair */
export const dockerfileTools: ChatCompletionTool[] = [...codebaseTools, verifyDockerImageTool];

/**
 * Parse a Docker image reference into registry, repo, and tag.
 * Handles registries with ports (e.g. localhost:5000/myapp:v1).
 */
function parseImageRef(imageRef: string): {
  registry: string | null;
  repo: string;
  tag: string;
} {
  const segments = imageRef.split("/");
  let registry: string | null = null;
  let repoParts: string[];

  if (segments.length > 1 && (segments[0].includes(".") || segments[0].includes(":"))) {
    registry = segments[0];
    repoParts = segments.slice(1);
  } else {
    repoParts = segments;
  }

  const last = repoParts[repoParts.length - 1];
  const colonIdx = last.lastIndexOf(":");
  let tag = "latest";
  if (colonIdx !== -1) {
    tag = last.substring(colonIdx + 1);
    repoParts[repoParts.length - 1] = last.substring(0, colonIdx);
  }

  return { registry, repo: repoParts.join("/"), tag };
}

/**
 * Check if a Docker image:tag exists on its registry.
 * Supports Docker Hub (default) and third-party registries (MCR, GHCR, GCR, Quay, etc.)
 */
export async function verifyDockerImage(imageRef: string): Promise<boolean> {
  const { registry, repo, tag } = parseImageRef(imageRef);

  if (registry) {
    return verifyOciImage(`${registry}/${repo}`, tag);
  }

  // Docker Hub: official images are under library/
  const hubRepo = repo.includes("/") ? repo : `library/${repo}`;
  const url = `https://hub.docker.com/v2/repositories/${hubRepo}/tags/${tag}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_DEFAULT),
      headers: { Accept: "application/json" },
    });
    return res.ok;
  } catch {
    return true;
  }
}

/**
 * Verify an image on an OCI-compliant registry using the Distribution API.
 */
async function verifyOciImage(imagePart: string, tag: string): Promise<boolean> {
  const segments = imagePart.split("/");
  const registry = segments[0];
  const repo = segments.slice(1).join("/");

  const url = `https://${registry}/v2/${repo}/manifests/${tag}`;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_DEFAULT),
      headers: {
        Accept: [
          "application/vnd.docker.distribution.manifest.v2+json",
          "application/vnd.docker.distribution.manifest.list.v2+json",
          "application/vnd.oci.image.manifest.v1+json",
          "application/vnd.oci.image.index.v1+json",
        ].join(", "),
      },
    });
    return res.ok;
  } catch {
    return true;
  }
}

export function createDockerfileToolHandler(repoPath: string): ToolHandler {
  const baseHandler = createToolHandler(repoPath);
  return async (name: string, args: Record<string, unknown>) => {
    if (name === "verify_docker_image") {
      const image = String(args.image ?? "");
      if (!image) return "Error: image parameter is required";
      const exists = await verifyDockerImage(image);
      return exists
        ? `✓ Image "${image}" exists on Docker Hub`
        : `✗ Image "${image}" NOT FOUND on Docker Hub. Try a different tag.`;
    }
    return baseHandler(name, args);
  };
}

/**
 * Validate all FROM lines in a Dockerfile against Docker Hub.
 * Returns list of images that don't exist.
 */
export async function validateDockerfileImages(dockerfile: string): Promise<string[]> {
  const fromRe = /^FROM\s+(\S+)/gim;
  const images = new Set<string>();
  let m;
  while ((m = fromRe.exec(dockerfile)) !== null) {
    const img = m[1];
    if (img.startsWith("$") || img === "scratch") continue;
    if (!img.includes("/") && !img.includes(":") && img === img.toLowerCase()) {
      const officialPrefixes = [
        "node",
        "python",
        "golang",
        "ruby",
        "rust",
        "openjdk",
        "eclipse-temurin",
        "amazoncorretto",
        "maven",
        "gradle",
        "php",
        "nginx",
        "alpine",
        "ubuntu",
        "debian",
      ];
      if (!officialPrefixes.some((p) => img.startsWith(p))) continue;
    }
    images.add(img);
  }

  const missing: string[] = [];
  for (const img of images) {
    const exists = await verifyDockerImage(img);
    if (!exists) {
      missing.push(img);
      console.warn(`[Startup] Docker image not found: ${img}`);
    }
  }
  return missing;
}

/**
 * Try common tag variations for a Docker image until one is found.
 */
async function findAlternativeImage(badRef: string): Promise<string | null> {
  const { registry, repo, tag: badTag } = parseImageRef(badRef);
  const imagePart = registry ? `${registry}/${repo}` : repo;

  const candidates: string[] = [];

  if (badTag.endsWith("-slim")) {
    candidates.push(`${imagePart}:${badTag.replace(/-slim$/, "")}`);
  } else {
    candidates.push(`${imagePart}:${badTag}-slim`);
  }

  const parts = badTag.split("-");
  if (parts.length >= 3) {
    candidates.push(`${imagePart}:${parts[0]}-${parts[parts.length - 1]}`);
    candidates.push(`${imagePart}:${parts[0]}`);
  }
  if (parts.length >= 2) {
    candidates.push(`${imagePart}:${parts[0]}`);
  }

  const versionMatch = badTag.match(/^(\d+\.\d+)/);
  if (versionMatch) {
    candidates.push(`${imagePart}:${versionMatch[1]}`);
  }

  const seen = new Set([badRef]);
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (await verifyDockerImage(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Validate all FROM images in a Dockerfile. For any that don't exist on Docker
 * Hub, attempt to find a working alternative tag and replace inline.
 */
export async function fixDockerfileImages(dockerfile: string): Promise<string> {
  const missing = await validateDockerfileImages(dockerfile);
  if (missing.length === 0) return dockerfile;

  let patched = dockerfile;
  for (const bad of missing) {
    const alt = await findAlternativeImage(bad);
    if (alt) {
      console.log(`[Startup] Auto-fixing Docker image: ${bad} → ${alt}`);
      patched = patched.split(bad).join(alt);
    } else {
      console.warn(`[Startup] No alternative found for Docker image: ${bad}`);
    }
  }
  return patched;
}
