import { Configuration, LogLevel } from "@sectester/core";
import { type Repeater, RepeaterFactory } from "@sectester/repeater";
import type { BrightApiContext } from "../types.js";

export interface RepeaterHandle {
  repeaterId: string;
  stop(): Promise<void>;
}

export async function setupRepeater(
  projectId: string,
  api: BrightApiContext,
): Promise<RepeaterHandle> {
  const configuration = new Configuration({
    hostname: api.brightHostname,
    projectId,
    credentials: { token: api.brightToken },
    logLevel: LogLevel.NOTICE,
  });

  const factory = configuration.container.resolve(RepeaterFactory);
  const repeater = await factory.createRepeater({
    namePrefix: `engine-${Date.now()}`,
    disableRandomNameGeneration: true,
  });
  const repeaterId = repeater.repeaterId;

  console.log(`[Repeater] Created repeater: ${repeaterId}`);

  try {
    await startRepeaterWithTimeout(repeater, 60_000);
  } catch (err) {
    await repeater.stop().catch(() => undefined);
    throw err;
  }

  console.log(`[Repeater] Connected: ${repeaterId}`);
  return {
    repeaterId,
    stop: async () => {
      await repeater.stop();
    },
  };
}

async function startRepeaterWithTimeout(repeater: Repeater, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      repeater.start(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Timed out waiting for repeater connection")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
