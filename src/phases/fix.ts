import type OpenAI from "openai";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import type { TechStack, Finding, SecurityFix } from "../types.js";
import { chatWithTools, chatWithSchema } from "../inference.js";
import { codebaseTools, createToolHandler } from "../tools.js";
import { formatTechStack, toErrorMessage } from "../utils.js";
import {
  taintAnalysisPrompt,
  generateFixPrompt,
  fixResultSchema,
} from "../prompts/generate-fix.js";

export async function generateFixes(
  llm: OpenAI,
  repoPath: string,
  techStack: TechStack,
  findings: Finding[],
  previousFixes: SecurityFix[],
  model?: string,
): Promise<SecurityFix[]> {
  const stackStr = formatTechStack(techStack);
  const handleTool = createToolHandler(repoPath);
  const fixes: SecurityFix[] = [];

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
    const taintAnalysis = await chatWithTools(
      llm,
      taintMessages,
      codebaseTools,
      handleTool,
      model,
    );

    // Step 2: Collect affected files mentioned in taint analysis
    const filePaths = extractFilePaths(taintAnalysis, repoPath);
    const affectedFiles = filePaths.map((p) => ({
      path: p,
      content: safeReadFile(resolve(repoPath, p)),
    }));

    // Step 3: Generate fix
    const fixMessages = generateFixPrompt(
      stackStr,
      finding,
      taintAnalysis,
      affectedFiles,
      previousAttempt
        ? {
            fix: JSON.stringify({
              summary: previousAttempt.summary,
              files: previousAttempt.files,
            }),
            stillVulnerable: true,
          }
        : undefined,
    );

    try {
      const result = await chatWithSchema<{
        summary: string;
        files: Array<{ path: string; content: string }>;
      }>(llm, fixMessages, "fix_result", fixResultSchema, model);

      fixes.push({
        vulnerability: finding,
        files: result.files,
        summary: result.summary,
        verified: false,
      });

      console.log(`[Fix] Generated fix: ${result.summary}`);
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
      const fullPath = resolve(repoPath, file.path);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, file.content, "utf-8");
      console.log(`[Fix] Wrote ${file.path}`);
    }
  }
}

/**
 * Extract file paths from taint analysis text.
 * Looks for patterns like `src/foo/bar.ts` or `./app/controllers/users.js`
 */
function extractFilePaths(text: string, repoPath: string): string[] {
  const regex = /(?:^|\s|`)((?:\.\/)?(?:[\w./-]+\/)+[\w.-]+\.\w+)/gm;
  const paths = new Set<string>();

  let match;
  while ((match = regex.exec(text)) !== null) {
    const p = match[1].replace(/^\.\//, "");
    // Verify the file exists
    try {
      readFileSync(resolve(repoPath, p));
      paths.add(p);
    } catch {
      // Not a real file path
    }
  }

  return [...paths];
}

function safeReadFile(fullPath: string): string {
  try {
    return readFileSync(fullPath, "utf-8");
  } catch {
    return "";
  }
}
