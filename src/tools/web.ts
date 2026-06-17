import { writeFileSync } from "fs";
import type { ChatCompletionTool } from "openai/resources/chat/completions.mjs";
import { resolve } from "path";
import type { ToolHandler } from "../inference.js";
import { FETCH_TIMEOUT_LONG, toErrorMessage } from "../utils.js";

/**
 * Strip HTML to plain text — removes scripts/styles, converts block
 * elements to newlines, decodes entities.
 */
function htmlToText(html: string): string {
  let text = html;
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|dt|dd|blockquote|pre|section|article)>/gi, "\n");
  text = text.replace(/<br[^>]*\/?>/gi, "\n");
  text = text.replace(/<hr[^>]*\/?>/gi, "\n---\n");
  text = text.replace(/<[^>]*>/g, "");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n[ \t]+/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/**
 * Search the web using DuckDuckGo HTML (no API key required).
 * Returns top results with title, URL, and snippet.
 */
async function searchWeb(query: string): Promise<string> {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_LONG),
    });
    if (!res.ok) return `Search failed (HTTP ${res.status})`;
    const html = await res.text();

    const blocks = html.split(/class="result\s/);
    const results: string[] = [];

    for (const block of blocks.slice(1, 8)) {
      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
      const title = titleMatch ? htmlToText(titleMatch[1]).trim() : "";

      const hrefMatch = block.match(/class="result__a"[^>]*href="([^"]*)"/);
      let url = hrefMatch ? hrefMatch[1] : "";
      const uddgMatch = url.match(/[?&]uddg=([^&]*)/);
      if (uddgMatch) url = decodeURIComponent(uddgMatch[1]);

      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      const snippet = snippetMatch ? htmlToText(snippetMatch[1]).trim() : "";

      if (title && (snippet || url)) {
        results.push(`${results.length + 1}. ${title}\n   ${url}\n   ${snippet}`);
      }
    }

    if (results.length === 0) return "No search results found. Try rephrasing the query.";
    return results.join("\n\n");
  } catch (err) {
    return `Search error: ${toErrorMessage(err)}`;
  }
}

const FETCH_INLINE_LIMIT = 1500;
const FETCH_FILE_LIMIT = 20_000;

/**
 * Fetch a URL and return its text content (HTML stripped).
 * Useful for reading documentation, Stack Overflow answers, etc.
 */
async function fetchUrlContent(targetUrl: string, repoPath?: string): Promise<string> {
  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
        Accept: "text/html, text/plain, application/json, */*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_LONG),
    });
    if (!res.ok) return `Failed to fetch (HTTP ${res.status})`;

    const contentType = res.headers.get("content-type") || "";
    const body = await res.text();

    let text: string;
    if (contentType.includes("text/plain") || contentType.includes("application/json")) {
      text = body;
    } else {
      text = htmlToText(body);
    }

    if (text.length > FETCH_FILE_LIMIT) {
      text = text.slice(0, FETCH_FILE_LIMIT) + "\n... [truncated at 20 000 chars]";
    }

    if (text.length <= FETCH_INLINE_LIMIT) {
      return text;
    }

    if (repoPath) {
      const filePath = resolve(repoPath, ".bright-fetched-page.txt");
      writeFileSync(filePath, text, "utf-8");
      const preview = text.slice(0, 800);
      return `Content saved to .bright-fetched-page.txt (${text.length} chars). Use read_file to see the full page.\n\nPreview:\n${preview}\n...`;
    }

    // No repoPath fallback — return truncated inline
    return text.slice(0, 3000) + "\n... [truncated — content too large for inline]";
  } catch (err) {
    return `Fetch error: ${toErrorMessage(err)}`;
  }
}

const searchWebTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "search_web",
    description:
      "Search the public web for technical solutions. Use for public OSS docs, framework/package behavior, OS package names, version-specific configuration, or generic error messages. Do NOT search for private/local repository paths, selected monorepo service names, or internal code identifiers; inspect the codebase for those instead. Returns top results with titles and snippets.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            'Public technical search query without local repo paths (e.g. "install imagemagick 7 debian bookworm", "fix Pitchfork::BootFailure rails 7", "postgresql 16 apt repository ubuntu 24.04")',
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

const fetchUrlTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "fetch_url",
    description:
      "Fetch a web page and return its text content. Use after search_web to read the full content of a promising result (e.g. a Stack Overflow answer, documentation page, or GitHub issue). Returns page text with HTML stripped.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch (from search_web results or known documentation)",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
};

/** Web search + URL fetch tool definitions — reusable across phases */
export const webSearchTools: ChatCompletionTool[] = [searchWebTool, fetchUrlTool];

function looksLikeInternalCodeSearch(query: string): boolean {
  return (
    /(?:^|\s|["'`])(?:\.\/)?(?:apps|packages|services|libs|modules)\/[A-Za-z0-9._/-]+/i.test(
      query,
    ) ||
    /(?:^|\s|["'`])(?:\/tmp\/|\/home\/|\/workspace\/|\/workspaces\/|\/app\/)[^\s"'`]+/i.test(query)
  );
}

/**
 * Create a tool handler for search_web and fetch_url.
 * Pass repoPath so large fetched pages are saved to .bright-fetched-page.txt.
 */
export function createWebSearchHandler(repoPath: string): ToolHandler {
  return async (name: string, args: Record<string, unknown>) => {
    if (name === "search_web") {
      const query = String(args.query ?? "").trim();
      if (!query) return "Error: query parameter is required";
      if (looksLikeInternalCodeSearch(query)) {
        console.log(`[Tool] search_web skipped internal query: ${query}`);
        return [
          "Search skipped: this query appears to contain a local/private repository path or internal monorepo service name.",
          "Use codebase tools (list_files/read_file/search_files) for internal paths.",
          'If public web search is still needed, reformulate using a public OSS project/framework/package name or a generic error, for example "NestJS Docker pnpm monorepo production build" or "rails ENOENT magick binary".',
        ].join("\n");
      }
      console.log(`[Tool] search_web: ${query}`);
      return searchWeb(query);
    }
    if (name === "fetch_url") {
      const url = String(args.url ?? "").trim();
      if (!url) return "Error: url parameter is required";
      console.log(`[Tool] fetch_url: ${url.slice(0, 200)}`);
      return fetchUrlContent(url, repoPath);
    }
    return `Unknown tool: ${name}`;
  };
}
