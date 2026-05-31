import { createRequire } from 'module';const require = createRequire(import.meta.url);
import "./chunk-T3WERZCU.js";

// src/phases/partial-boot.ts
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
var ESSENTIAL_IMAGE_PATTERNS = [
  /postgres/i,
  /mysql/i,
  /mariadb/i,
  /mongo/i,
  /redis/i,
  /memcached/i
];
var NON_ESSENTIAL_IMAGE_PATTERNS = [
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
  /playwright/i
];
function isEssentialImage(image) {
  return ESSENTIAL_IMAGE_PATTERNS.some((p) => p.test(image));
}
function isNonEssentialImage(image) {
  return NON_ESSENTIAL_IMAGE_PATTERNS.some((p) => p.test(image));
}
function stripNonEssentialServices(repoPath, composeFile) {
  const filePath = resolve(repoPath, composeFile);
  const content = readFileSync(filePath, "utf-8");
  const servicesMatch = content.match(/^services:\s*$/m);
  if (!servicesMatch) {
    return { strippedFile: composeFile, removed: [] };
  }
  const lines = content.split("\n");
  const servicesLineIdx = lines.findIndex((l) => /^services:\s*$/.test(l));
  if (servicesLineIdx === -1) {
    return { strippedFile: composeFile, removed: [] };
  }
  const services = [];
  let i = servicesLineIdx + 1;
  while (i < lines.length) {
    const svcMatch = lines[i].match(/^  (\w[\w-]*):\s*$/);
    if (svcMatch) {
      const name = svcMatch[1];
      const startLine = i;
      i++;
      while (i < lines.length && !/^  \w[\w-]*:\s*$/.test(lines[i]) && !/^\w/.test(lines[i])) {
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
        image: imageMatch ? imageMatch[1] : null
      });
    } else if (/^\w/.test(lines[i])) {
      break;
    } else {
      i++;
    }
  }
  const toRemove = [];
  for (const svc of services) {
    if (svc.hasBuild) continue;
    if (svc.image && isEssentialImage(svc.image)) continue;
    if (svc.image && isNonEssentialImage(svc.image)) {
      toRemove.push(svc.name);
    }
  }
  if (toRemove.length === 0) {
    return { strippedFile: composeFile, removed: [] };
  }
  const removeSet = new Set(toRemove);
  const blocksToRemove = services.filter((s) => removeSet.has(s.name)).sort((a, b) => b.startLine - a.startLine);
  const stripped = [...lines];
  for (const block of blocksToRemove) {
    stripped.splice(block.startLine, block.endLine - block.startLine);
  }
  let result = stripped.join("\n");
  for (const name of toRemove) {
    result = result.replace(
      new RegExp(`^\\s+- ${name}\\s*$`, "gm"),
      ""
    );
    result = result.replace(
      new RegExp(`^\\s+${name}:\\s*\\n(\\s+condition:.*\\n)?`, "gm"),
      ""
    );
  }
  result = result.replace(/^\s+depends_on:\s*\n(?=\s+\w|\s*$)/gm, "");
  const strippedPath = composeFile.replace(/\.ya?ml$/, ".partial.yml");
  writeFileSync(resolve(repoPath, strippedPath), result);
  console.log(
    `[PartialBoot] Stripped ${toRemove.length} non-essential service(s) from ${composeFile}: ${toRemove.join(", ")}`
  );
  console.log(`[PartialBoot] Wrote minimal compose to ${strippedPath}`);
  return { strippedFile: strippedPath, removed: toRemove };
}
export {
  stripNonEssentialServices
};
//# sourceMappingURL=partial-boot-ZT6TQE5J.js.map