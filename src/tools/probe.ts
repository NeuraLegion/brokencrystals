import { writeFileSync } from "fs";
import type { ChatCompletionTool } from "openai/resources/chat/completions.mjs";
import { resolve } from "path";
import type { ToolHandler } from "../inference.js";
import { FETCH_TIMEOUT_LONG, saveProbeBody, toErrorMessage } from "../utils.js";

export const probeUrlTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "probe_url",
    description:
      "Make an HTTP request to a URL and return the status code, headers, and response body. Use this to check if the application is responding, diagnose 500 errors, test endpoints, etc.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Full URL to probe (e.g. http://localhost:3000/)",
        },
        method: {
          type: "string",
          description: "HTTP method (GET, POST, PUT, etc.). Defaults to GET.",
        },
        headers: {
          type: "string",
          description:
            'Optional JSON object of headers (e.g. \'{"Content-Type": "application/json"}\')',
        },
        body: {
          type: "string",
          description: "Optional request body for POST/PUT requests",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
};

/**
 * HTTP probe — make a request and return status, headers, and body preview.
 * Used by infra repair and retry LLMs to diagnose HTTP issues (500 errors etc.)
 */
export async function probeUrl(args: Record<string, unknown>): Promise<string> {
  const url = String(args.url ?? "");
  if (!url) return "Error: url parameter is required";
  const method = String(args.method ?? "GET").toUpperCase();

  let extraHeaders: Record<string, string> = {};
  if (args.headers) {
    try {
      extraHeaders = JSON.parse(String(args.headers));
    } catch {
      return "Error: invalid JSON in headers parameter";
    }
  }

  const fetchOpts: RequestInit = {
    method,
    headers: {
      Accept: "application/json, text/html, */*",
      ...extraHeaders,
    },
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_LONG),
  };

  if (args.body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    fetchOpts.body = String(args.body);
  }

  try {
    console.log(`[Tool] probe_url: ${method} ${url}`);
    const res = await fetch(url, fetchOpts);
    const status = res.status;

    const headerLines: string[] = [];
    for (const [k, v] of res.headers.entries()) {
      const lk = k.toLowerCase();
      if (
        lk === "content-type" ||
        lk === "location" ||
        lk === "set-cookie" ||
        lk === "www-authenticate" ||
        lk === "x-csrf-token"
      ) {
        headerLines.push(`${k}: ${v}`);
      }
    }

    const bodyText = await res.text().catch(() => "");
    const bodyPreview =
      bodyText.length > 2000 ? bodyText.slice(0, 2000) + "\n... [truncated]" : bodyText;

    const parts = [`HTTP ${status}`];
    if (headerLines.length > 0) parts.push(headerLines.join("\n"));
    parts.push(bodyPreview || "(empty body)");

    // Save full body to file when truncated — LLM can read_file for details
    const contentType = res.headers.get("content-type") ?? "";
    const savedPath = saveProbeBody(bodyText, contentType);
    if (savedPath) {
      parts.push(
        `\n📄 Full response body (${bodyText.length} bytes) saved to: ${savedPath}\nUse read_file to inspect for errors, setup instructions, or configuration requirements.`,
      );
    }

    console.log(`[Tool] probe_url result: ${status}`);
    return parts.join("\n\n");
  } catch (err) {
    const msg = toErrorMessage(err);
    console.log(`[Tool] probe_url error: ${msg}`);
    return `Error: ${msg}`;
  }
}

/** Alias export for phases that don't need cookie tracking */
export { probeUrl as handleProbeUrl };
