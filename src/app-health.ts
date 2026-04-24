import { checkAppHealth } from "./phases/startup.js";
import { toErrorMessage } from "./utils.js";

/**
 * Result of a recovery attempt. Caller updates its appProcess reference
 * if `process` is returned.
 */
export interface RecoveryResult {
  ok: boolean;
  process?: unknown;
  detail: string;
}

export type RecoveryCallback = () => Promise<RecoveryResult>;

export interface AppHealthMonitorOptions {
  port: number;
  healthCheckPath?: string;
  pollIntervalMs?: number;
  /** Number of consecutive failed probes before declaring unhealthy. */
  failureThreshold?: number;
  /** Recovery callback. If omitted, monitor only signals — caller does the recovery itself. */
  onRecover?: RecoveryCallback;
}

/**
 * Background health monitor for the target app.
 *
 * Long-running operations (entrypoint registration, scan orchestration)
 * call `waitHealthy()` before each unit of work. When N consecutive probes
 * fail, the monitor flips to unhealthy, all `waitHealthy()` callers block,
 * and the recovery callback fires. Once recovery returns ok the gate opens.
 *
 * Workers can also call `signalProbableUnhealthy()` to short-circuit the
 * polling cadence when they observe a strong indicator (e.g. Bright telling
 * us the target is down) — this triggers an immediate probe instead of
 * waiting for the next interval.
 */
export class AppHealthMonitor {
  private readonly port: number;
  private readonly healthCheckPath: string;
  private readonly pollIntervalMs: number;
  private readonly failureThreshold: number;
  private onRecover?: RecoveryCallback;

  private timer?: NodeJS.Timeout;
  private running = false;
  private healthy = true;
  private consecutiveFailures = 0;
  private probeInFlight = false;
  private recoveryInFlight: Promise<RecoveryResult> | undefined;
  private gate: { promise: Promise<void>; resolve: () => void } | undefined;

  constructor(opts: AppHealthMonitorOptions) {
    this.port = opts.port;
    this.healthCheckPath = opts.healthCheckPath ?? "/";
    this.pollIntervalMs = opts.pollIntervalMs ?? 15_000;
    this.failureThreshold = opts.failureThreshold ?? 3;
    this.onRecover = opts.onRecover;
  }

  setRecoveryCallback(cb: RecoveryCallback): void {
    this.onRecover = cb;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.probe("scheduled");
    }, this.pollIntervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
    console.log(
      `[AppHealth] Monitor started — polling http://localhost:${this.port}${this.healthCheckPath} every ${this.pollIntervalMs / 1000}s`,
    );
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    // Release any waiters so they don't hang during shutdown.
    if (this.gate) {
      this.gate.resolve();
      this.gate = undefined;
    }
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  /**
   * Resolves immediately if healthy. Otherwise blocks until the gate opens
   * (recovery succeeds, monitor is stopped, or gate is manually opened).
   */
  async waitHealthy(): Promise<void> {
    if (this.healthy) return;
    if (!this.gate) {
      // Should never happen — gate is created when we go unhealthy. Defend anyway.
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      this.gate = { promise, resolve };
    }
    await this.gate.promise;
  }

  /**
   * Tells the monitor that an external observation suggests the app may be
   * unhealthy (e.g. Bright reported "target is down" for a registration).
   * Triggers an immediate probe outside the regular polling cadence.
   */
  signalProbableUnhealthy(reason: string): void {
    if (!this.running) return;
    if (this.probeInFlight) return;
    void this.probe(`signal: ${reason}`);
  }

  private async probe(reason: string): Promise<void> {
    if (!this.running) return;
    if (this.probeInFlight) return;
    this.probeInFlight = true;
    try {
      const ok = await checkAppHealth(this.port, this.healthCheckPath);
      if (ok) {
        if (this.consecutiveFailures > 0) {
          console.log(
            `[AppHealth] Recovered (${reason}) — clearing ${this.consecutiveFailures} failure(s)`,
          );
        }
        this.consecutiveFailures = 0;
        if (!this.healthy) this.markHealthy();
      } else {
        this.consecutiveFailures += 1;
        console.warn(
          `[AppHealth] Probe failed (${reason}) — ${this.consecutiveFailures}/${this.failureThreshold}`,
        );
        if (
          this.healthy &&
          this.consecutiveFailures >= this.failureThreshold
        ) {
          this.markUnhealthy();
          // Fire recovery (don't await — probe is allowed to return)
          void this.runRecovery();
        }
      }
    } finally {
      this.probeInFlight = false;
    }
  }

  private markUnhealthy(): void {
    this.healthy = false;
    if (!this.gate) {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      this.gate = { promise, resolve };
    }
    console.warn(
      `[AppHealth] App marked UNHEALTHY — pausing dependent operations`,
    );
  }

  private markHealthy(): void {
    this.healthy = true;
    const gate = this.gate;
    this.gate = undefined;
    if (gate) gate.resolve();
    console.log(`[AppHealth] App marked HEALTHY — resuming operations`);
  }

  private async runRecovery(): Promise<RecoveryResult> {
    if (this.recoveryInFlight) return this.recoveryInFlight;
    if (!this.onRecover) {
      console.warn(`[AppHealth] No recovery callback registered — staying paused`);
      return { ok: false, detail: "no recovery callback" };
    }
    const cb = this.onRecover;
    this.recoveryInFlight = (async () => {
      try {
        console.log(`[AppHealth] Triggering recovery...`);
        const result = await cb();
        if (result.ok) {
          // Probe immediately to confirm and open the gate
          this.consecutiveFailures = 0;
          await this.probe("post-recovery");
          if (!this.healthy) this.markHealthy(); // force-open even if probe was racy
        } else {
          console.error(
            `[AppHealth] Recovery did not restore health: ${result.detail}`,
          );
        }
        return result;
      } catch (err) {
        const msg = toErrorMessage(err);
        console.error(`[AppHealth] Recovery threw: ${msg}`);
        return { ok: false, detail: msg };
      } finally {
        this.recoveryInFlight = undefined;
      }
    })();
    return this.recoveryInFlight;
  }
}
