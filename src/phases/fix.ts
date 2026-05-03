import type OpenAI from "openai";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname, basename } from "path";
import type { TechStack, Finding, SecurityFix } from "../types.js";
import { chatWithTools } from "../inference.js";
import {
  codebaseTools,
  createToolHandler,
  editFileTool,
  handleEditFile,
} from "../tools.js";
import { formatTechStack, toErrorMessage } from "../utils.js";
import { taintAnalysisPrompt } from "../prompts/generate-fix.js";

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
  /\.conf\.py$/,           // e.g. sentry.conf.py
  /nginx\.conf$/,
  /apache2?\.conf$/,
  /httpd\.conf$/,
  /\.env$/,                // environment files
  /\.env\.\w+$/,           // .env.local, .env.production, etc.
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

  for (const finding of findings) {
    console.log(`[Fix] Analyzing: ${finding.name} at ${finding.url}`);

    // Check for previous failed attempt
    const previousAttempt = previousFixes.find(
      (f) =>
        f.vulnerability.name === finding.name &&
        f.vulnerability.url === finding.url &&
        !f.verified,
    );

    // Step 1: Taint analysis
    const taintMessages = taintAnalysisPrompt(stackStr, finding);
    if (contextSummary && taintMessages[0]?.role === "system" && typeof taintMessages[0].content === "string") {
      taintMessages[0].content += `\n\nApplication context:\n${contextSummary}`;
    }
    const taintAnalysis = await chatWithTools(
      llm,
      taintMessages,
      codebaseTools,
      handleTool,
      model,
    );

    // Step 2: Generate and apply fix using edit_file tool calls
    const editedFiles = new Map<string, string>(); // path → content before edit

    // Track edits via a wrapping handler
    const fixToolHandler = async (name: string, args: Record<string, unknown>): Promise<string> => {
      if (name === "edit_file") {
        const filePath = String(args.path ?? "");
        if (isInfrastructureFile(filePath)) {
          return `Error: cannot modify infrastructure file ${filePath} — only application source code can be changed.`;
        }
        // Snapshot original content before first edit
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
      const summary = await chatWithTools(
        llm,
        fixMessages,
        fixTools,
        fixToolHandler,
        model,
      );

      if (editedFiles.size === 0) {
        console.warn(`[Fix] No edits applied for ${finding.name}`);
        continue;
      }

      // Collect the patched file contents
      const patchedFiles = [];
      for (const [filePath] of editedFiles) {
        try {
          const content = readFileSync(resolve(repoPath, filePath), "utf-8");
          patchedFiles.push({ path: filePath, content });
        } catch {
          // File was edited but now unreadable — skip
        }
      }

      fixes.push({
        vulnerability: finding,
        files: patchedFiles,
        summary: summary.slice(0, 500),
        verified: false,
      });

      console.log(`[Fix] Generated fix (${patchedFiles.length} file(s)): ${summary.slice(0, 200)}`);
    } catch (err) {
      console.error(
        `[Fix] Failed to generate fix for ${finding.name}: ${toErrorMessage(err)}`,
      );
    }
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
