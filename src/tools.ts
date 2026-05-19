import { readFileSync, existsSync, statSync, writeFileSync } from "fs";
import { resolve } from "path";
import { glob } from "glob";
import { execFileSync, execSync } from "child_process";
import type { ChatCompletionTool } from "openai/resources/chat/completions.mjs";
import type { ToolHandler } from "./inference.js";
import { runShellCommand, toErrorMessage, saveProbeBody, PROBE_RESPONSE_DIR, FETCH_TIMEOUT_DEFAULT, FETCH_TIMEOUT_LONG } from "./utils.js";

export const codebaseTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read the contents of a file from the repository. Returns the full file text.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Relative file path from the repository root (e.g. src/app.ts)",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description:
        "List files matching a glob pattern in the repository. Returns newline-separated file paths.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description:
              'Glob pattern relative to the repo root (e.g. "src/**/*.ts", "*.json")',
          },
        },
        required: ["pattern"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description:
        "Search file contents for a pattern using grep. Returns matching lines with file paths and line numbers. Supports both fixed text and regex patterns.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search pattern (fixed text by default, or regex if regex=true)",
          },
          glob: {
            type: "string",
            description:
              'Optional glob to restrict search to certain files (e.g. "*.ts")',
          },
          regex: {
            type: "boolean",
            description:
              "If true, treat query as a regular expression instead of fixed text. Useful for searching patterns like 'authenticate|authorize|login'.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
];

export function createToolHandler(repoPath: string): ToolHandler {
  return async (name: string, args: Record<string, unknown>) => {
    switch (name) {
      case "read_file": {
        const rawPath = String(args.path ?? "");
        // Allow absolute paths to probe response directory (saved by probe_url)
        const filePath = rawPath.startsWith("/")
          ? resolve(rawPath)
          : resolve(repoPath, rawPath);
        if (!filePath.startsWith(repoPath) && !filePath.startsWith(PROBE_RESPONSE_DIR + "/")) {
          return "Error: path traversal attempt blocked";
        }
        if (!existsSync(filePath)) {
          return `Error: file not found: ${args.path}`;
        }
        if (statSync(filePath).isDirectory()) {
          return `Error: path is a directory, not a file: ${args.path}`;
        }
        const content = readFileSync(filePath, "utf-8");
        if (content.length > 50_000) {
          return content.slice(0, 50_000) + "\n... [truncated at 50000 chars]";
        }
        return content;
      }

      case "list_files": {
        const pattern = String(args.pattern ?? "**/*");
        const files = await glob(pattern, {
          cwd: repoPath,
          nodir: true,
          ignore: [
            "node_modules/**",
            ".git/**",
            "dist/**",
            "build/**",
            "vendor/**",
            ".data/**",
          ],
        });
        if (files.length === 0) return "No files found matching that pattern.";
        if (files.length > 200) {
          return (
            files.slice(0, 200).join("\n") +
            `\n... and ${files.length - 200} more`
          );
        }
        return files.join("\n");
      }

      case "search_files": {
        const query = String(args.query ?? "");
        const fileGlob = args.glob ? String(args.glob) : undefined;
        const useRegex = args.regex === true;
        try {
          const grepArgs = [
            "-rn",
            "--binary-files=without-match",
            "--include",
            fileGlob ?? "*",
            "--exclude-dir=node_modules",
            "--exclude-dir=.git",
            "--exclude-dir=dist",
            "--exclude-dir=build",
            "--exclude-dir=vendor",
            "--exclude-dir=.data",
            "--exclude-dir=data",
            "--exclude=*.min.js",
            "--exclude=*.min.css",
            "--exclude=*.bundle.js",
            "--exclude=*.chunk.js",
            "--exclude=*.map",
            ...(useRegex ? ["-E"] : ["-F"]),
            "--",
            query,
            ".",
          ];
          const output = execFileSync("grep", grepArgs, {
            cwd: repoPath,
            encoding: "utf-8",
            maxBuffer: 1024 * 1024,
            timeout: 10_000,
          });
          const MAX_LINES = 100;
          const MAX_LINE_LENGTH = 500;
          const MAX_TOTAL_CHARS = 30_000;
          const rawLines = output.trim().split("\n");
          const totalCount = rawLines.length;
          const truncatedLines: string[] = [];
          let totalChars = 0;
          for (let i = 0; i < Math.min(totalCount, MAX_LINES); i++) {
            let line = rawLines[i];
            if (line.length > MAX_LINE_LENGTH) {
              line = line.slice(0, MAX_LINE_LENGTH) + "… [truncated]";
            }
            if (totalChars + line.length > MAX_TOTAL_CHARS) {
              truncatedLines.push(`... [output truncated at ${MAX_TOTAL_CHARS} chars]`);
              break;
            }
            truncatedLines.push(line);
            totalChars += line.length + 1;
          }
          if (totalCount > MAX_LINES) {
            truncatedLines.push(`... and ${totalCount - MAX_LINES} more matches`);
          }
          return truncatedLines.join("\n");
        } catch {
          return "No matches found.";
        }
      }

      default:
        return `Error: unknown tool ${name}`;
    }
  };
}

// ---------------------------------------------------------------------------
// Infrastructure repair tools — write_file + run_command_on_host +
// run_command_in_docker for fixing scripts, compose files, configs, etc.
// between retry attempts.
// ---------------------------------------------------------------------------

const writeFileTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "write_file",
    description:
      "Write content to a file (create or overwrite). Use this to patch shell scripts, compose files, config files, etc.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Relative file path from the repository root (e.g. bin/docker/exec)",
        },
        content: {
          type: "string",
          description: "The full file content to write",
        },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
};

export const editFileTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "edit_file",
    description:
      "Make a targeted edit to a file by replacing an exact string match. Much safer than write_file for small changes — you don't need to rewrite the entire file. The old_string must match EXACTLY one occurrence in the file (including whitespace/indentation).",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Relative file path from the repository root (e.g. compose.yml, Dockerfile)",
        },
        old_string: {
          type: "string",
          description:
            "The exact string to find in the file. Must match exactly one occurrence. Include enough surrounding context (a few lines) to ensure uniqueness.",
        },
        new_string: {
          type: "string",
          description:
            "The replacement string. Can be empty to delete the matched text.",
        },
      },
      required: ["path", "old_string", "new_string"],
      additionalProperties: false,
    },
  },
};

export const runCommandOnHostTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "run_command_on_host",
    description:
      "Run a shell command on the HOST machine (not inside a Docker container). Use for host-level diagnostics (docker ps, docker logs, docker inspect, ls, cat), builds (docker build, docker compose build), or small file fixes (sed, chmod). Commands are killed after 120 seconds.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            'Host shell command (e.g. "docker logs myapp --tail 50", "docker build -t myapp .", "sed -i \'s/old/new/g\' config.yml")',
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
};

export const runCommandInDockerTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "run_command_in_docker",
    description:
      "Run a command INSIDE a Docker container. Use this to inspect the container environment, check what's installed, read logs, test commands, or create seed data. Automatically wraps the command with 'docker exec' (running container) or 'docker run --rm' (image). Commands are killed after 120 seconds.",
    parameters: {
      type: "object",
      properties: {
        container: {
          type: "string",
          description:
            'Container name/ID (for running containers) or image name (to start a temporary container). e.g. "bright-app-local", "myapp-web-1", "abc123def"',
        },
        command: {
          type: "string",
          description:
            'Command to run inside the container (e.g. "which pnpm", "rails runner \'User.create!(...)\'", "cat /app/config/database.yml", "ps aux")',
        },
      },
      required: ["container", "command"],
      additionalProperties: false,
    },
  },
};

// infraTools is defined after verifyDockerImageTool below

// ---------------------------------------------------------------------------
// Shared handler helpers — reused by auth.ts, setup.ts, and infra handler
// ---------------------------------------------------------------------------

/**
 * Execute a command inside a Docker container.
 * Automatically detects whether `container` is a running container (→ docker exec)
 * or an image name (→ docker run --rm).
 */
export function execInDocker(
  repoPath: string,
  container: string,
  command: string,
  timeout = 120_000,
): string {
  const isRunning = (() => {
    try {
      const out = execSync(
        `docker inspect --format='{{.State.Running}}' ${JSON.stringify(container)} 2>/dev/null`,
        { encoding: "utf-8", timeout: 5_000 },
      ).trim();
      return out === "true";
    } catch {
      return false;
    }
  })();
  // Pass command via stdin (here-doc) to avoid shell expansion of $-signs
  // in values like bcrypt hashes ($2a$10$...) which get eaten by sh -c "...".
  const prefix = isRunning
    ? `docker exec -i ${JSON.stringify(container)}`
    : `docker run --rm -i ${JSON.stringify(container)}`;
  const dockerCmd = `${prefix} sh <<'__BRIGHT_EOF__'\n${command}\n__BRIGHT_EOF__`;
  return runShellCommand(repoPath, dockerCmd, timeout);
}

/**
 * Handle an edit_file tool call — find-and-replace exactly one occurrence.
 * Returns a human-readable result string.
 */
export function handleEditFile(
  repoPath: string,
  args: Record<string, unknown>,
): string {
  const filePath = resolve(repoPath, String(args.path ?? ""));
  if (!filePath.startsWith(repoPath)) {
    return "Error: path traversal attempt blocked";
  }
  const oldStr = String(args.old_string ?? "");
  const newStr = String(args.new_string ?? "");
  if (!oldStr) return "Error: old_string is required";
  try {
    const existing = readFileSync(filePath, "utf-8");
    const count = existing.split(oldStr).length - 1;
    if (count === 0) {
      return `Error: old_string not found in ${args.path}. Make sure the string matches exactly (including whitespace and indentation).`;
    }
    if (count > 1) {
      return `Error: old_string found ${count} times in ${args.path}. Include more surrounding context to make it unique.`;
    }
    const updated = existing.replace(oldStr, newStr);
    writeFileSync(filePath, updated);
    return `Edited ${args.path}: replaced ${oldStr.length} chars with ${newStr.length} chars`;
  } catch (err) {
    return `Error editing file: ${toErrorMessage(err)}`;
  }
}

/** Export the infra probeUrl for phases that don't need cookie tracking */
export { probeUrl as handleProbeUrl };

export function createInfraToolHandler(repoPath: string, onHint?: (hint: string) => void, onRemoveHint?: (hint: string) => void): ToolHandler {
  const baseHandler = createDockerfileToolHandler(repoPath);
  return async (name: string, args: Record<string, unknown>) => {
    switch (name) {
      case "write_file": {
        const filePath = resolve(repoPath, String(args.path ?? ""));
        if (!filePath.startsWith(repoPath)) {
          return "Error: path traversal attempt blocked";
        }
        const content = String(args.content ?? "");
        try {
          writeFileSync(filePath, content);
          return `Written ${content.length} bytes to ${args.path}`;
        } catch (err) {
          return `Error writing file: ${toErrorMessage(err)}`;
        }
      }

      case "edit_file":
        return handleEditFile(repoPath, args);

      case "run_command_on_host": {
        const command = String(args.command ?? "");
        // Guard: block blanket volume destruction — infra repair should target specific volumes
        if (/docker\s+compose\s+down\s+[^|]*-v/i.test(command) ||
            /docker-compose\s+down\s+[^|]*-v/i.test(command) ||
            /docker\s+volume\s+prune/i.test(command) ||
            /docker\s+system\s+prune/i.test(command)) {
          console.warn(`[Tool] BLOCKED destructive command in infra repair: ${command.slice(0, 120)}`);
          return `Error: "docker compose down -v" and volume prune commands are blocked. They destroy ALL volumes including healthy data. Instead, remove only the specific stale volume: "docker compose down && docker volume rm <volume_name> && docker compose up -d". Use "docker volume ls" to identify which volume to remove.`;
        }
        console.log(`[Tool] run_command_on_host: ${command.slice(0, 200)}`);
        return runShellCommand(repoPath, command, 120_000);
      }

      case "run_command_in_docker": {
        const container = String(args.container ?? "");
        const cmd = String(args.command ?? "");
        console.log(`[Tool] run_command_in_docker [${container}]: ${cmd.slice(0, 200)}`);
        return execInDocker(repoPath, container, cmd, 120_000);
      }

      case "wait": {
        const seconds = Math.min(60, Math.max(1, Number(args.seconds ?? 10)));
        console.log(`[Tool] wait: ${seconds}s`);
        await new Promise((r) => setTimeout(r, seconds * 1000));
        return `Waited ${seconds} seconds`;
      }

      case "save_hint": {
        const hint = String(args.hint ?? "").trim();
        if (!hint) return "Error: hint cannot be empty";
        console.log(`[Tool] save_hint: ${hint.slice(0, 200)}`);
        if (onHint) onHint(hint);
        return `Hint saved: "${hint.slice(0, 100)}". It will be available to the next repair attempt.`;
      }

      case "remove_hint": {
        const hint = String(args.hint ?? "").trim();
        if (!hint) return "Error: hint cannot be empty";
        console.log(`[Tool] remove_hint: ${hint.slice(0, 200)}`);
        if (onRemoveHint) onRemoveHint(hint);
        return `Hint removed (if it existed). Remaining hints will be shown to the next attempt.`;
      }

      case "probe_url": {
        return probeUrl(args);
      }

      case "search_web":
      case "fetch_url": {
        const webHandler = createWebSearchHandler(repoPath);
        return webHandler(name, args);
      }

      default:
        return baseHandler(name, args);
    }
  };
}

// ---------------------------------------------------------------------------
// Docker image verification tool
// ---------------------------------------------------------------------------

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

const waitTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "wait",
    description:
      "Wait for a specified number of seconds. Use this when services need time to start up before checking again. Max 60 seconds.",
    parameters: {
      type: "object",
      properties: {
        seconds: {
          type: "number",
          description: "Number of seconds to wait (1-60)",
        },
      },
      required: ["seconds"],
      additionalProperties: false,
    },
  },
};

const saveHintTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "save_hint",
    description:
      "Save an important discovery or hint for the NEXT repair attempt. Use this when you learn something critical about how this application works (e.g. 'App reads DB settings from config/database.yml, not from DATABASE_URL', 'The app needs Redis on port 6379'). These hints survive across repair iterations so the next attempt doesn't have to rediscover the same facts.",
    parameters: {
      type: "object",
      properties: {
        hint: {
          type: "string",
          description:
            "A concise factual statement about the application's configuration, dependencies, or behavior. Should be actionable for the next repair attempt.",
        },
      },
      required: ["hint"],
      additionalProperties: false,
    },
  },
};

const removeHintTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "remove_hint",
    description:
      "Remove a previously saved hint that turned out to be WRONG or MISLEADING. Use this when you discover that a hint from a previous attempt led to a failure or was based on incorrect assumptions. Pass the exact hint text (or a substring) to remove it.",
    parameters: {
      type: "object",
      properties: {
        hint: {
          type: "string",
          description:
            "The exact text (or substring) of the hint to remove.",
        },
      },
      required: ["hint"],
      additionalProperties: false,
    },
  },
};

// ---------------------------------------------------------------------------
// Web search & URL fetching tools (for infra repair knowledge gaps)
// ---------------------------------------------------------------------------

/**
 * Strip HTML to plain text — removes scripts/styles, converts block
 * elements to newlines, decodes entities.
 */
function htmlToText(html: string): string {
  let text = html;
  // Remove script and style blocks
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");
  // Add newlines for block elements
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|dt|dd|blockquote|pre|section|article)>/gi, "\n");
  text = text.replace(/<br[^>]*\/?>/gi, "\n");
  text = text.replace(/<hr[^>]*\/?>/gi, "\n---\n");
  // Remove remaining tags
  text = text.replace(/<[^>]*>/g, "");
  // Decode common entities
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
  // Normalize whitespace
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
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_LONG),
      },
    );
    if (!res.ok) return `Search failed (HTTP ${res.status})`;
    const html = await res.text();

    // Split on result blocks — DuckDuckGo wraps each result with class="result "
    const blocks = html.split(/class="result\s/);
    const results: string[] = [];

    for (const block of blocks.slice(1, 8)) {
      // Extract title from <a class="result__a">
      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
      const title = titleMatch ? htmlToText(titleMatch[1]).trim() : "";

      // Extract URL from href — DuckDuckGo wraps real URLs in a redirect with uddg= param
      const hrefMatch = block.match(/class="result__a"[^>]*href="([^"]*)"/);
      let url = hrefMatch ? hrefMatch[1] : "";
      const uddgMatch = url.match(/[?&]uddg=([^&]*)/);
      if (uddgMatch) url = decodeURIComponent(uddgMatch[1]);

      // Extract snippet from <a class="result__snippet">
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

/**
 * Fetch a URL and return its text content (HTML stripped).
 * Useful for reading documentation, Stack Overflow answers, etc.
 */
const FETCH_INLINE_LIMIT = 1500;
const FETCH_FILE_LIMIT = 20_000;

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

    // Convert HTML to text, leave plain text / JSON as-is
    let text: string;
    if (contentType.includes("text/plain") || contentType.includes("application/json")) {
      text = body;
    } else {
      text = htmlToText(body);
    }

    // Hard cap
    if (text.length > FETCH_FILE_LIMIT) {
      text = text.slice(0, FETCH_FILE_LIMIT) + "\n... [truncated at 20 000 chars]";
    }

    // Small content — return inline
    if (text.length <= FETCH_INLINE_LIMIT) {
      return text;
    }

    // Large content — save to file, return preview
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
    /(?:^|\s|["'`])(?:\.\/)?(?:apps|packages|services|libs|modules)\/[A-Za-z0-9._/-]+/i.test(query) ||
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
          description: 'Optional JSON object of headers (e.g. \'{"Content-Type": "application/json"}\')',
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

/** Codebase tools + write_file + run_command_on_host + run_command_in_docker + wait + save_hint — for infrastructure repair between retries */
export const infraTools: ChatCompletionTool[] = [
  ...codebaseTools,
  verifyDockerImageTool,
  writeFileTool,
  editFileTool,
  runCommandOnHostTool,
  runCommandInDockerTool,
  waitTool,
  probeUrlTool,
  searchWebTool,
  fetchUrlTool,
  saveHintTool,
  removeHintTool,
];

/** Codebase tools + Docker image verification — for Dockerfile generation/repair */
export const dockerfileTools: ChatCompletionTool[] = [
  ...codebaseTools,
  verifyDockerImageTool,
];

/**
 * Parse a Docker image reference into registry, repo, and tag.
 * Handles registries with ports (e.g. localhost:5000/myapp:v1).
 * Registry is detected by a '.' or ':' in the first path segment.
 */
function parseImageRef(imageRef: string): {
  registry: string | null;
  repo: string;
  tag: string;
} {
  const segments = imageRef.split("/");
  let registry: string | null = null;
  let repoParts: string[];

  // First segment with '.' or ':' indicates a registry (e.g. mcr.microsoft.com, localhost:5000)
  if (
    segments.length > 1 &&
    (segments[0].includes(".") || segments[0].includes(":"))
  ) {
    registry = segments[0];
    repoParts = segments.slice(1);
  } else {
    repoParts = segments;
  }

  // Tag is after the last ':' in the last path segment
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
 * via the OCI Distribution API.
 */
export async function verifyDockerImage(imageRef: string): Promise<boolean> {
  const { registry, repo, tag } = parseImageRef(imageRef);

  // Third-party registry detected — use OCI Distribution API
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
    // Network error or timeout — assume it exists to avoid false negatives
    return true;
  }
}

/**
 * Verify an image on an OCI-compliant registry using the Distribution API.
 * Works with mcr.microsoft.com, ghcr.io, gcr.io, quay.io, etc.
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
    // Network error or timeout — assume it exists to avoid false negatives
    return true;
  }
}

/**
 * HTTP probe — make a request and return status, headers, and body preview.
 * Used by infra repair and retry LLMs to diagnose HTTP issues (500 errors etc.)
 */
async function probeUrl(args: Record<string, unknown>): Promise<string> {
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
      if (lk === "content-type" || lk === "location" || lk === "set-cookie" ||
          lk === "www-authenticate" || lk === "x-csrf-token") {
        headerLines.push(`${k}: ${v}`);
      }
    }

    const bodyText = await res.text().catch(() => "");
    const bodyPreview = bodyText.length > 2000
      ? bodyText.slice(0, 2000) + "\n... [truncated]"
      : bodyText;

    const parts = [`HTTP ${status}`];
    if (headerLines.length > 0) parts.push(headerLines.join("\n"));
    parts.push(bodyPreview || "(empty body)");

    // Save full body to file when truncated — LLM can read_file for details
    const contentType = res.headers.get("content-type") ?? "";
    const savedPath = saveProbeBody(bodyText, contentType);
    if (savedPath) {
      parts.push(`\n📄 Full response body (${bodyText.length} bytes) saved to: ${savedPath}\nUse read_file to inspect for errors, setup instructions, or configuration requirements.`);
    }

    console.log(`[Tool] probe_url result: ${status}`);
    return parts.join("\n\n");
  } catch (err) {
    const msg = toErrorMessage(err);
    console.log(`[Tool] probe_url error: ${msg}`);
    return `Error: ${msg}`;
  }
}

export function createDockerfileToolHandler(
  repoPath: string,
): ToolHandler {
  const baseHandler = createToolHandler(repoPath);
  return async (name: string, args: Record<string, unknown>) => {
    if (name === "verify_docker_image") {
      const image = String(args.image ?? "");
      if (!image) return "Error: image parameter is required";
      const exists = await verifyDockerImage(image);
      return exists ? `✓ Image "${image}" exists on Docker Hub` : `✗ Image "${image}" NOT FOUND on Docker Hub. Try a different tag.`;
    }
    return baseHandler(name, args);
  };
}

/**
 * Validate all FROM lines in a Dockerfile against Docker Hub.
 * Returns list of images that don't exist.
 */
export async function validateDockerfileImages(
  dockerfile: string,
): Promise<string[]> {
  const fromRe = /^FROM\s+(\S+)/gmi;
  const images = new Set<string>();
  let m;
  while ((m = fromRe.exec(dockerfile)) !== null) {
    const img = m[1];
    // Skip build args like $VARIANT and scratch
    if (img.startsWith("$") || img === "scratch") continue;
    // Skip AS aliases referenced in other FROM lines
    if (!img.includes("/") && !img.includes(":") && img === img.toLowerCase()) {
      // Could be an alias — skip single-word lowercase without colons
      // unless it looks like a known official image
      const officialPrefixes = ["node", "python", "golang", "ruby", "rust", "openjdk", "eclipse-temurin", "amazoncorretto", "maven", "gradle", "php", "nginx", "alpine", "ubuntu", "debian"];
      if (!officialPrefixes.some(p => img.startsWith(p))) continue;
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
 * Returns the first working tag, or null if none found.
 */
async function findAlternativeImage(badRef: string): Promise<string | null> {
  const { registry, repo, tag: badTag } = parseImageRef(badRef);
  const imagePart = registry ? `${registry}/${repo}` : repo;

  // Generate candidates by trying common tag patterns
  const candidates: string[] = [];

  // Strip -slim suffix or add it
  if (badTag.endsWith("-slim")) {
    candidates.push(`${imagePart}:${badTag.replace(/-slim$/, "")}`);
  } else {
    candidates.push(`${imagePart}:${badTag}-slim`);
  }

  // Try without OS suffix (e.g. ruby:3.4-bookworm-slim → ruby:3.4-slim)
  const parts = badTag.split("-");
  if (parts.length >= 3) {
    // e.g. ["3.4", "bookworm", "slim"] → try "3.4-slim", "3.4"
    candidates.push(`${imagePart}:${parts[0]}-${parts[parts.length - 1]}`);
    candidates.push(`${imagePart}:${parts[0]}`);
  }
  if (parts.length >= 2) {
    // e.g. ["3.4", "bookworm"] → try "3.4"
    candidates.push(`${imagePart}:${parts[0]}`);
  }

  // Try just major.minor
  const versionMatch = badTag.match(/^(\d+\.\d+)/);
  if (versionMatch) {
    candidates.push(`${imagePart}:${versionMatch[1]}`);
  }

  // Deduplicate and exclude the original
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
 * Returns the (possibly patched) Dockerfile content.
 */
export async function fixDockerfileImages(
  dockerfile: string,
): Promise<string> {
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

// ---------------------------------------------------------------------------
// (MCP helpers removed — Bright access is now via direct REST in bright-api.ts)
// ---------------------------------------------------------------------------
