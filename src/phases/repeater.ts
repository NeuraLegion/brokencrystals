import { spawn, type ChildProcess } from "child_process";

export interface RepeaterHandle {
  repeaterId: string;
  process: ChildProcess;
}

export async function setupRepeater(
  _llm: unknown,
  _bright: unknown,
  projectId: string,
  brightToken: string,
  brightHostname: string,
): Promise<RepeaterHandle> {
  const name = `engine-${Date.now()}`;

  // Create repeater via REST API — no LLM needed
  const res = await fetch(`https://${brightHostname}/api/v1/repeaters`, {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${brightToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, projectIds: [projectId] }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to create repeater: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { id: string };
  const repeaterId = data.id;

  if (!repeaterId) {
    throw new Error("Repeater creation returned no ID");
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
