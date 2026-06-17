import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Partial-boot fallback: strip non-essential services from compose so the app
// can start with just DB + cache. Accepts partial 500s on routes that need
// missing deps — Bright still scans everything that works.
// ---------------------------------------------------------------------------

/**
 * Services the app typically MUST have to boot and serve any HTTP routes.
 * If a compose service's image matches these, keep it.
 */
const ESSENTIAL_IMAGE_PATTERNS = [
  /postgres/i,
  /mysql/i,
  /mariadb/i,
  /mongo/i,
  /redis/i,
  /memcached/i,
];

/**
 * Services that are nice-to-have but NOT required for DAST scanning of the
 * app's HTTP routes. Bright doesn't scan through these — they're auth
 * providers, monitoring, email, AI, reverse proxies, admin UIs.
 * If a compose service's image matches these, strip it.
 */
const NON_ESSENTIAL_IMAGE_PATTERNS = [
  /keycloak/i,
  /watchtower/i,
  /mailhog/i,
  /mailpit/i,
  /mailcatcher/i,
  /ollama/i,
  /elasticsearch/i,
  /kibana/i,
  /minio/i,
  /rabbitmq/i,
  /nginx/i,
  /traefik/i,
  /haproxy/i,
  /adminer/i,
  /pgadmin/i,
  /phpmyadmin/i,
  /prometheus/i,
  /grafana/i,
  /jaeger/i,
  /zipkin/i,
  /sentry/i,
  /selenium/i,
  /cypress/i,
  /playwright/i,
];

function isEssentialImage(image: string): boolean {
  return ESSENTIAL_IMAGE_PATTERNS.some((p) => p.test(image));
}

function isNonEssentialImage(image: string): boolean {
  return NON_ESSENTIAL_IMAGE_PATTERNS.some((p) => p.test(image));
}

/**
 * Parse a compose file and strip non-essential services. The app service
 * (the one with `build:`) is always kept. Services with essential images
 * (DB, cache) are kept. Everything else is removed.
 *
 * Also removes `depends_on` references to stripped services so compose
 * doesn't error on missing dependencies.
 *
 * Returns the list of removed service names (empty if nothing was stripped).
 */
export function stripNonEssentialServices(
  repoPath: string,
  composeFile: string,
): { strippedFile: string; removed: string[] } {
  const filePath = resolve(repoPath, composeFile);
  const content = readFileSync(filePath, "utf-8");

  // Find the services: block
  const servicesMatch = content.match(/^services:\s*$/m);
  if (!servicesMatch) {
    return { strippedFile: composeFile, removed: [] };
  }

  // Parse service blocks (2-space indent names under services:)
  const lines = content.split("\n");
  const servicesLineIdx = lines.findIndex((l) => /^services:\s*$/.test(l));
  if (servicesLineIdx === -1) {
    return { strippedFile: composeFile, removed: [] };
  }

  // Identify each service: its name, line range, whether it has build:, its image:
  interface ServiceBlock {
    name: string;
    startLine: number;
    endLine: number; // exclusive
    hasBuild: boolean;
    image: string | null;
  }

  const services: ServiceBlock[] = [];
  let i = servicesLineIdx + 1;
  while (i < lines.length) {
    // A service definition starts with exactly 2 spaces + a word + colon
    const svcMatch = lines[i].match(/^ {2}(\w[\w-]*):\s*$/);
    if (svcMatch) {
      const name = svcMatch[1];
      const startLine = i;
      i++;
      // Find end of this service block (next 2-space service or end of file / top-level key)
      while (i < lines.length && !/^ {2}\w[\w-]*:\s*$/.test(lines[i]) && !/^\w/.test(lines[i])) {
        i++;
      }
      const section = lines.slice(startLine, i).join("\n");
      const hasBuild = /^\s+build:/m.test(section);
      const imageMatch = section.match(/^\s+image:\s*['"]?(\S+?)['"]?\s*$/m);
      services.push({
        name,
        startLine,
        endLine: i,
        hasBuild,
        image: imageMatch ? imageMatch[1] : null,
      });
    } else if (/^\w/.test(lines[i])) {
      // Top-level key (volumes:, networks:, etc.) — stop parsing services
      break;
    } else {
      i++;
    }
  }

  // Classify: keep app (has build:), keep essential images, strip the rest
  const toRemove: string[] = [];
  for (const svc of services) {
    if (svc.hasBuild) continue; // app service — always keep
    if (svc.image && isEssentialImage(svc.image)) continue; // DB/cache — keep
    if (svc.image && isNonEssentialImage(svc.image)) {
      toRemove.push(svc.name);
    }
    // If image doesn't match either pattern, keep it (unknown = might be needed)
  }

  if (toRemove.length === 0) {
    return { strippedFile: composeFile, removed: [] };
  }

  // Remove the service blocks (in reverse line order to preserve indices)
  const removeSet = new Set(toRemove);
  const blocksToRemove = services
    .filter((s) => removeSet.has(s.name))
    .sort((a, b) => b.startLine - a.startLine); // reverse order

  const stripped = [...lines];
  for (const block of blocksToRemove) {
    stripped.splice(block.startLine, block.endLine - block.startLine);
  }

  // Remove depends_on references to stripped services
  let result = stripped.join("\n");
  for (const name of toRemove) {
    // Remove lines like "      - keycloak" or "      keycloak:" under depends_on
    result = result.replace(new RegExp(`^\\s+- ${name}\\s*$`, "gm"), "");
    result = result.replace(new RegExp(`^\\s+${name}:\\s*\\n(\\s+condition:.*\\n)?`, "gm"), "");
  }

  // Clean up empty depends_on blocks left behind
  result = result.replace(/^\s+depends_on:\s*\n(?=\s+\w|\s*$)/gm, "");

  // Write the stripped compose to a new file
  const strippedPath = composeFile.replace(/\.ya?ml$/, ".partial.yml");
  writeFileSync(resolve(repoPath, strippedPath), result);

  console.log(
    `[PartialBoot] Stripped ${toRemove.length} non-essential service(s) from ${composeFile}: ${toRemove.join(", ")}`,
  );
  console.log(`[PartialBoot] Wrote minimal compose to ${strippedPath}`);

  return { strippedFile: strippedPath, removed: toRemove };
}
