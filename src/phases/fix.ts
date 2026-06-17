import { mkdirSync, readFileSync, writeFileSync } from "fs";
import type OpenAI from "openai";
import { basename, dirname, resolve } from "path";
import { chatWithTools } from "../inference.js";
import { taintAnalysisPrompt } from "../prompts/generate-fix.js";
import { codebaseTools, createToolHandler, editFileTool, handleEditFile } from "../tools.js";
import type { Finding, SecurityFix, TechStack } from "../types.js";
import { formatTechStack, toErrorMessage } from "../utils.js";

// Concurrency-limited Promise.all with results
async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Infrastructure file guard — prevent fix phase from modifying files that
// affect how the app boots rather than its application logic.
// ---------------------------------------------------------------------------

const INFRA_FILE_PATTERNS: RegExp[] = [
  // Docker / compose files
  /^Dockerfile/i,
  /docker-compose\.ya?ml$/i,
  /^compose\.ya?ml$/i,
  // Server / deployment configuration
  /\.conf\.py$/, // e.g. sentry.conf.py
  /nginx\.conf$/,
  /apache2?\.conf$/,
  /httpd\.conf$/,
  /\.env$/, // environment files
  /\.env\.\w+$/, // .env.local, .env.production, etc.
  // CI / build pipeline
  /^\.github\//,
  /^\.gitlab-ci/,
  /^Jenkinsfile/i,
  /^Makefile$/i,
  // Kubernetes / infrastructure-as-code
  /\.ya?ml$.*(?:deploy|service|ingress|configmap|secret)/i,
  /^k8s\//,
  /^helm\//,
  /^terraform\//,
];

/** Basename-only patterns for files that are always infra regardless of path */
const INFRA_BASENAME_EXACT = new Set([
  "dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
  ".env",
  "makefile",
  "jenkinsfile",
]);

export function isInfrastructureFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  const base = basename(normalized).toLowerCase();

  if (INFRA_BASENAME_EXACT.has(base)) return true;
  for (const pattern of INFRA_FILE_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }
  return false;
}

export async function generateFixes(
  llm: OpenAI,
  repoPath: string,
  techStack: TechStack,
  findings: Finding[],
  previousFixes: SecurityFix[],
  model?: string,
  contextSummary?: string,
): Promise<SecurityFix[]> {
  const stackStr = formatTechStack(techStack);
  const handleTool = createToolHandler(repoPath);
  const fixes: SecurityFix[] = [];

  // Fix tools: read/search/list for investigation + edit_file for applying fixes
  const fixTools = [...codebaseTools, editFileTool];

  // --- Group findings by primary file to avoid parallel conflicts ---
  // Findings that affect the same file go in the same sequential group.
  // Different groups can run in parallel safely.
  const fileGroups = new Map<string, Finding[]>();
  for (const finding of findings) {
    // Use the URL path or finding.filePath to determine the likely target file.
    // Taint analysis will find the real file, but for grouping purposes we use
    // the URL path as a proxy (findings hitting the same route usually touch
    // the same handler file).
    const groupKey = finding.url ?? finding.name;
    const group = fileGroups.get(groupKey) ?? [];
    group.push(finding);
    fileGroups.set(groupKey, group);
  }

  // Convert to array of groups
  const groups = [...fileGroups.values()];
  const CONCURRENCY = 5;

  console.log(
    `[Fix] Processing ${findings.length} findings in ${groups.length} group(s), concurrency ${CONCURRENCY}`,
  );

  /** Generate a fix for a single finding (extracted for reuse in parallel) */
  const generateSingleFix = async (finding: Finding): Promise<SecurityFix | null> => {
    console.log(`[Fix] Analyzing: ${finding.name} at ${finding.url}`);

    const previousAttempt = previousFixes.find(
      (f) =>
        f.vulnerability.name === finding.name && f.vulnerability.url === finding.url && !f.verified,
    );

    // Step 1: Taint analysis
    const taintMessages = taintAnalysisPrompt(stackStr, finding);
    if (
      contextSummary &&
      taintMessages[0]?.role === "system" &&
      typeof taintMessages[0].content === "string"
    ) {
      taintMessages[0].content += `\n\nApplication context:\n${contextSummary}`;
    }
    const taintAnalysis = await chatWithTools(llm, taintMessages, codebaseTools, handleTool, model);

    // Step 2: Generate and apply fix using edit_file tool calls
    const editedFiles = new Map<string, string>();

    const fixToolHandler = async (name: string, args: Record<string, unknown>): Promise<string> => {
      if (name === "edit_file") {
        const filePath = String(args.path ?? "");
        if (isInfrastructureFile(filePath)) {
          return `Error: cannot modify infrastructure file ${filePath} — only application source code can be changed.`;
        }
        if (!editedFiles.has(filePath)) {
          try {
            editedFiles.set(filePath, readFileSync(resolve(repoPath, filePath), "utf-8"));
          } catch {
            editedFiles.set(filePath, "");
          }
        }
        const result = handleEditFile(repoPath, args);
        if (!result.startsWith("Error")) {
          console.log(`[Fix] Edited ${filePath}`);
        }
        return result;
      }
      return handleTool(name, args);
    };

    let previousContext = "";
    if (previousAttempt) {
      previousContext = `\n\nIMPORTANT: A previous fix attempt was made but DID NOT resolve the vulnerability — the DAST scan still found the same issue. Previous attempt summary: "${previousAttempt.summary}". You must use a DIFFERENT, more thorough approach this time.`;
    }

    const fixMessages = [
      {
        role: "system" as const,
        content: `You are a security engineer fixing vulnerabilities in a ${stackStr} application. You have tools to read code and apply edits directly.

Use edit_file to make surgical, targeted fixes. Each edit_file call replaces exactly one occurrence of old_string with new_string.

Guidelines:
- Use read_file to examine the affected code first if needed
- Apply minimal, targeted fixes — only change what's necessary
- Follow the framework's built-in security features and best practices
- Validate and sanitize user inputs at the boundary
- NEVER modify infrastructure files (Dockerfile, docker-compose.yml, .env, etc.)
- After applying your fix, briefly summarize what you changed${previousContext}${contextSummary ? `\n\nApplication context:\n${contextSummary}` : ""}`,
      },
      {
        role: "user" as const,
        content: `Fix this vulnerability by editing the source code:

Vulnerability: ${finding.name}
Severity: ${finding.severity}
URL: ${finding.url}
Method: ${finding.method}
Details: ${finding.details}
Remedy: ${finding.remedy}

Taint Analysis:
${taintAnalysis}

Use edit_file to apply the fix directly. Then summarize what you changed.`,
      },
    ];

    try {
      const summary = await chatWithTools(llm, fixMessages, fixTools, fixToolHandler, model);

      if (editedFiles.size === 0) {
        console.warn(`[Fix] No edits applied for ${finding.name}`);
        return null;
      }

      const patchedFiles = [];
      for (const [filePath] of editedFiles) {
        try {
          const content = readFileSync(resolve(repoPath, filePath), "utf-8");
          patchedFiles.push({ path: filePath, content });
        } catch {
          /* skip */
        }
      }

      console.log(`[Fix] Generated fix (${patchedFiles.length} file(s)): ${summary.slice(0, 200)}`);
      return {
        vulnerability: finding,
        files: patchedFiles,
        summary: summary.slice(0, 500),
        verified: false,
      };
    } catch (err) {
      console.error(`[Fix] Failed to generate fix for ${finding.name}: ${toErrorMessage(err)}`);
      return null;
    }
  };

  // --- Run groups in parallel (CONCURRENCY-limited) ---
  // Within each group, findings are sequential (same file risk).
  // Across groups, they run in parallel.
  const groupResults = await pMap(
    groups,
    async (group) => {
      const results: SecurityFix[] = [];
      for (const finding of group) {
        const fix = await generateSingleFix(finding);
        if (fix) results.push(fix);
      }
      return results;
    },
    CONCURRENCY,
  );

  for (const groupFixes of groupResults) {
    fixes.push(...groupFixes);
  }

  return fixes;
}

export function applyFixes(repoPath: string, fixes: SecurityFix[]): void {
  for (const fix of fixes) {
    for (const file of fix.files) {
      if (isInfrastructureFile(file.path)) {
        console.warn(
          `[Fix] BLOCKED infrastructure file modification: ${file.path} — ` +
            `security fixes must only modify application source code`,
        );
        continue;
      }
      const fullPath = resolve(repoPath, file.path);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, file.content, "utf-8");
      console.log(`[Fix] Wrote ${file.path}`);
    }
  }
}
