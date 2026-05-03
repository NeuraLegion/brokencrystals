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
