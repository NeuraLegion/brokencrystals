import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";
import type { Finding } from "../types.js";

export function taintAnalysisPrompt(
  techStack: string,
  finding: Finding,
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `You are a security engineer performing taint analysis on a ${techStack} application. Given a DAST vulnerability finding, trace the data flow from the HTTP input (source) to the vulnerable code (sink). Use the tools to read source files and search the codebase.

Your goal is to identify:
1. The source: where user input enters the application (request parameter, body field, header)
2. The propagation: how the tainted data flows through the code (variable assignments, function calls, transformations)
3. The sink: where the tainted data reaches a dangerous operation (SQL query, HTML output, command execution, file system operation)
4. The specific file(s) and line(s) that need to be modified to fix the vulnerability`,
    },
    {
      role: "user",
      content: `Analyze this vulnerability and trace the data flow:

Vulnerability: ${finding.name}
Severity: ${finding.severity}
URL: ${finding.url}
Method: ${finding.method}
Details: ${finding.details}
Suggested Remedy: ${finding.remedy}

Use the read_file and search_files tools to trace the data flow from the HTTP endpoint to the vulnerable sink. Identify the exact files and code that need to be fixed.`,
    },
  ];
}

export function generateFixPrompt(
  techStack: string,
  finding: Finding,
  taintAnalysis: string,
  affectedFiles: Array<{ path: string; content: string }>,
  previousAttempt?: { fix: string; stillVulnerable: boolean },
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are a security engineer fixing vulnerabilities in a ${techStack} application. Generate secure code fixes that properly remediate the vulnerability without breaking functionality.

Guidelines:
- Follow the framework's built-in security features and best practices
- Validate and sanitize user inputs at the boundary
- Preserve the existing code style and patterns
- Only modify what is necessary to fix the vulnerability
- NEVER modify infrastructure files (Dockerfile, docker-compose.yml, compose.yml, .env, *.conf.py, nginx.conf, Makefile, etc.) — only modify application source code. Infrastructure file changes will be rejected.`,
    },
    {
      role: "user",
      content: `Fix this vulnerability:

Vulnerability: ${finding.name}
Severity: ${finding.severity}
Details: ${finding.details}
Remedy: ${finding.remedy}

Taint Analysis:
${taintAnalysis}

Affected files:
${affectedFiles.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n")}

Return a JSON object with the fixed file contents:
{
  "summary": "Brief description of the fix",
  "files": [
    { "path": "relative/path/to/file.ts", "content": "...entire fixed file content..." }
  ]
}`,
    },
  ];

  if (previousAttempt) {
    messages.push({
      role: "assistant",
      content: previousAttempt.fix,
    });
    messages.push({
      role: "user",
      content: `The previous fix attempt did not resolve the vulnerability — the DAST scan still found the same issue. Analyze why the previous fix was insufficient and generate a more thorough fix using a different approach.

Return the fix in the same JSON format.`,
    });
  }

  return messages;
}

export const fixResultSchema = {
  type: "object" as const,
  properties: {
    summary: { type: "string" as const },
    files: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          path: { type: "string" as const },
          content: { type: "string" as const },
        },
        required: ["path", "content"] as const,
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "files"] as const,
  additionalProperties: false,
};
