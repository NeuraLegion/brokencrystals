import type OpenAI from "openai";
import { spawn, type ChildProcess } from "child_process";
import type { BrightMcpClient } from "../mcp-client.js";
import { chatWithTools } from "../inference.js";
import { convertMcpToolsToOpenAI, createMcpToolHandler } from "../tools.js";
import { extractJson } from "../utils.js";

export interface RepeaterHandle {
  repeaterId: string;
  process: ChildProcess;
}

export async function setupRepeater(
  llm: OpenAI,
  bright: BrightMcpClient,
  projectId: string,
  brightToken: string,
  brightHostname: string,
): Promise<RepeaterHandle> {
  const mcpSchemas = await bright.getMcpToolSchemas(["createRepeater"]);
  const tools = convertMcpToolsToOpenAI(mcpSchemas);
  const handler = createMcpToolHandler(bright);

  const name = `engine-${Date.now()}`;

  const messages: Parameters<typeof chatWithTools>[1] = [
    {
      role: "system",
      content: `You are setting up a Bright security repeater for DAST scanning.
Use the provided tools to create a repeater in the specified project.
If you get an error, examine it and retry with corrected parameters.
Do NOT poll or check connection status — just create the repeater and return the ID.`,
    },
    {
      role: "user",
      content: `Create a Bright repeater named "${name}" in project "${projectId}".

When done, respond with ONLY a JSON object: {"repeaterId": "<the-repeater-id>"}
Do NOT call listRepeaters or check the repeater status.`,
    },
  ];

  const response = await chatWithTools(llm, messages, tools, handler);

  let repeaterId: string;
  try {
    const parsed = JSON.parse(extractJson(response));
    repeaterId = parsed.repeaterId;
  } catch {
    throw new Error(`Failed to parse repeater ID from LLM response: ${response.slice(0, 300)}`);
  }

  if (!repeaterId) {
    throw new Error("LLM did not return a repeater ID");
  }

  console.log(`[Repeater] Created repeater: ${repeaterId}`);
  const proc = spawn(
    "npx",
    [
      "@brightsec/cli",
      "repeater",
      "--id",
      repeaterId,
      "--token",
      brightToken,
      "--hostname",
      brightHostname,
    ],
    {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  proc.stdout?.on("data", (d: Buffer) =>
    console.log(`[Repeater] ${d.toString().trim()}`),
  );
  proc.stderr?.on("data", (d: Buffer) =>
    console.error(`[Repeater:err] ${d.toString().trim()}`),
  );

  proc.on("error", (err) => {
    console.error(`[Repeater] Process error: ${err.message}`);
  });

  // Wait for the repeater process to report connection or fail
  await waitForRepeaterReady(proc, 60_000);

  console.log(`[Repeater] Connected: ${repeaterId}`);
  return { repeaterId, process: proc };
}

async function waitForRepeaterReady(
  proc: ChildProcess,
  timeoutMs: number,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      console.warn("[Repeater] Timed out waiting for connection — proceeding anyway");
      cleanup();
      resolve();
    }, timeoutMs);

    let exited = false;

    function cleanup() {
      clearTimeout(timer);
      proc.stdout?.removeListener("data", onData);
      proc.removeListener("exit", onExit);
    }

    function onData(d: Buffer) {
      const text = d.toString();
      // bright-cli prints "connected to " or "Event:connected" when ready
      if (/connect(ed|ion established)/i.test(text)) {
        cleanup();
        resolve();
      }
    }

    function onExit(code: number | null) {
      exited = true;
      console.warn(`[Repeater] Process exited with code ${code} before connecting`);
      cleanup();
      resolve();
    }

    proc.stdout?.on("data", onData);
    proc.on("exit", onExit);

    // If already exited before we attached listeners
    if (proc.exitCode !== null) {
      cleanup();
      resolve();
    }
  });
}
