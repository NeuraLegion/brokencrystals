import { checkAppHealth, type ResponseHealthResult } from "./phases/startup.js";
import type { StartupHealthProbe } from "./types.js";
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

/**
 * Recovery callback. Receives an optional `hint` describing why the app
 * was flagged unhealthy (e.g. "returned the Ember CLI warning page") so
 * the LLM repair stage gets explicit context, not just "app down".
 */
export type RecoveryCallback = (hint?: string) => Promise<RecoveryResult>;

/**
 * Body-aware health probe. Returns whether the response from the app's
 * health-check URL looks like a real working app (vs a setup page,
 * dev-mode warning, error page, etc).
 */
export type DeepProbeFn = () => Promise<ResponseHealthResult>;

export interface AppHealthMonitorOptions {
  port: number;
  healthCheckPath?: string;
  healthProbe?: StartupHealthProbe;
  pollIntervalMs?: number;
  /** Number of consecutive failed probes before declaring unhealthy. */
  failureThreshold?: number;
  /** Recovery callback. If omitted, monitor only signals — caller does the recovery itself. */
  onRecover?: RecoveryCallback;
  /**
   * Optional body-aware probe. When set, runs every Nth shallow probe
   * (see `deepProbeEveryNth`). A single failure trips unhealthy and
   * triggers recovery — body-aware failures are stronger signals than
   * a missed status-code probe, so we don't wait for `failureThreshold`.
   */
  onDeepProbe?: DeepProbeFn;
  /** Run the deep probe every Nth shallow probe. Default: 5. */
  deepProbeEveryNth?: number;
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
  private readonly healthProbe?: StartupHealthProbe;
  private readonly pollIntervalMs: number;
  private readonly failureThreshold: number;
  private readonly deepProbeEveryNth: number;
  private onRecover?: RecoveryCallback;
  private onDeepProbe?: DeepProbeFn;

  private timer?: NodeJS.Timeout;
  private running = false;
  private paused = false;
  private healthy = true;
  private consecutiveFailures = 0;
  private probeCount = 0;
  private probeInFlight = false;
  private deepProbeInFlight = false;
  private recoveryInFlight: Promise<RecoveryResult> | undefined;
  private gate: { promise: Promise<void>; resolve: () => void } | undefined;
  private lastUnhealthyReason: string | undefined;
  /** When true, only a successful deep probe or recovery can clear the unhealthy state.
   *  Prevents the shallow (status-only) probe from re-marking healthy while the
   *  body-aware deep probe has identified a degraded state (e.g. SPA shell returns
   *  200 but the API layer is 500-ing). */
  private deepUnhealthy = false;

  constructor(opts: AppHealthMonitorOptions) {
    this.port = opts.port;
    this.healthCheckPath = opts.healthCheckPath ?? "/";
    this.healthProbe = opts.healthProbe;
    this.pollIntervalMs = opts.pollIntervalMs ?? 15_000;
    this.failureThreshold = opts.failureThreshold ?? 3;
    this.onRecover = opts.onRecover;
    this.onDeepProbe = opts.onDeepProbe;
    this.deepProbeEveryNth = opts.deepProbeEveryNth ?? 5;
  }

  setRecoveryCallback(cb: RecoveryCallback): void {
    this.onRecover = cb;
  }

  setDeepProbe(cb: DeepProbeFn): void {
    this.onDeepProbe = cb;
  }

  private describeProbe(): string {
    if (!this.healthProbe) return `http://localhost:${this.port}${this.healthCheckPath}`;
    const path = this.healthProbe.path.startsWith("/")
      ? this.healthProbe.path
      : `/${this.healthProbe.path}`;
    const method = (this.healthProbe.method ?? (this.healthProbe.formData || this.healthProbe.body ? "POST" : "GET")).toUpperCase();
    return `${method} http://localhost:${this.port}${path}`;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.probe("scheduled");
    }, this.pollIntervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
    console.log(
      `[AppHealth] Monitor started — polling ${this.describeProbe()} every ${this.pollIntervalMs / 1000}s`,
    );
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.paused = false;
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

  /**
   * Temporarily suspend probing and recovery. Use when the orchestrator
   * is rebuilding/restarting the app — avoids the health monitor racing
   * with docker compose up --build. If a recovery is already in flight,
   * waits for it to complete before returning.
   */
  async pause(): Promise<void> {
    if (this.paused) return;
    this.paused = true;
    // Wait for any in-flight recovery to complete so there's no concurrent
    // quickRestartCompose racing with the orchestrator's rebuild.
    if (this.recoveryInFlight) {
      try { await this.recoveryInFlight; } catch { /* ignore */ }
    }
    console.log("[AppHealth] Monitor paused (orchestrator owns the app lifecycle)");
  }

  /**
   * Resume probing after the orchestrator finishes its rebuild/restart.
   * Resets the failure counter so stale failures from the rebuild window
   * don't immediately trip the unhealthy threshold. Also marks healthy and
   * opens the gate if needed — the orchestrator already verified the app.
   */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.consecutiveFailures = 0;
    if (!this.healthy) this.markHealthy();
    console.log("[AppHealth] Monitor resumed");
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
    if (!this.running || this.paused) return;
    if (this.probeInFlight) return;
    void this.probe(`signal: ${reason}`);
  }

  /**
   * On-demand body-aware probe. Used by the orchestrator before each scan
   * round to fail-fast if the app has degraded into a setup-required /
   * dev-mode-warning state that the periodic shallow probe wouldn't catch.
   * If unhealthy, marks the monitor unhealthy and triggers recovery; the
   * returned promise resolves once recovery completes (or fails).
   */
  async verifyDeepHealth(): Promise<ResponseHealthResult> {
    if (!this.onDeepProbe) return { healthy: true, reason: "no deep probe configured" };
    if (this.deepProbeInFlight) {
      // Another caller is already probing — wait for the gate to settle.
      await this.waitHealthy();
      return { healthy: this.healthy, reason: this.lastUnhealthyReason ?? "ok" };
    }
    const result = await this.runDeepProbe("on-demand");
    if (!result.healthy) {
      // Wait for recovery to complete before returning so callers proceed
      // against a recovered app, not the broken one.
      await this.waitHealthy();
    }
    return result;
  }

  private async probe(reason: string): Promise<void> {
    if (!this.running || this.paused) return;
    if (this.probeInFlight) return;
    this.probeInFlight = true;
    try {
      const ok = await checkAppHealth(this.port, this.healthProbe ?? this.healthCheckPath);
      if (ok) {
        if (this.consecutiveFailures > 0) {
          console.log(
            `[AppHealth] Recovered (${reason}) — clearing ${this.consecutiveFailures} failure(s)`,
          );
        }
        this.consecutiveFailures = 0;
        // Only re-mark healthy if not held down by a deep probe verdict.
        // When the deep probe flagged the app as degraded (e.g. API layer
        // 500-ing while the HTML shell returns 200), the shallow status-
        // only probe must NOT override that — only a successful deep probe
        // or recovery can clear the deepUnhealthy flag.
        if (!this.healthy && !this.deepUnhealthy) this.markHealthy();
      } else {
        this.consecutiveFailures += 1;
        if (this.healthy) {
          console.warn(
            `[AppHealth] Probe failed (${reason}) — ${this.consecutiveFailures}/${this.failureThreshold}`,
          );
          if (this.consecutiveFailures >= this.failureThreshold) {
            this.lastUnhealthyReason = `app stopped responding to HTTP probes at ${this.describeProbe()}`;
            this.markUnhealthy();
            // Fire recovery (don't await — probe is allowed to return)
            void this.runRecovery();
          }
        }
        // Once already unhealthy, stay quiet — recovery will log when it acts.
      }

      // Periodic body-aware probe: catches degraded states (Ember CLI
      // warning, setup-required page, framework error) that return HTTP
      // 200 and so look healthy to the status-only check above.
      // Also runs when deepUnhealthy — needed to detect natural recovery
      // (e.g. a transient API outage resolves on its own) so the
      // deepUnhealthy hold can be cleared without requiring a restart.
      if (
        (this.healthy || this.deepUnhealthy) &&
        this.onDeepProbe &&
        reason === "scheduled" &&
        ++this.probeCount % this.deepProbeEveryNth === 0
      ) {
        // Don't await — keeps the regular probe cadence steady. runDeepProbe
        // handles its own concurrency guard.
        void this.runDeepProbe("scheduled-deep");
      }
    } finally {
      this.probeInFlight = false;
    }
  }

  private async runDeepProbe(reason: string): Promise<ResponseHealthResult> {
    if (!this.onDeepProbe) return { healthy: true, reason: "no deep probe" };
    if (this.deepProbeInFlight) return { healthy: this.healthy, reason: "already in flight" };
    this.deepProbeInFlight = true;
    try {
      const result = await this.onDeepProbe();
      if (!result.healthy) {
        console.warn(
          `[AppHealth] Deep probe (${reason}) UNHEALTHY — ${result.reason}`,
        );
        if (this.healthy) {
          this.lastUnhealthyReason = `deep health probe flagged the app as unhealthy: ${result.reason}`;
          this.deepUnhealthy = true;
          this.markUnhealthy();
          void this.runRecovery();
        }
      } else {
        console.log(`[AppHealth] Deep probe (${reason}) healthy — ${result.reason}`);
        // Clear deep-unhealthy hold if the app recovered on its own
        if (this.deepUnhealthy) {
          this.deepUnhealthy = false;
          if (!this.healthy) this.markHealthy();
        }
      }
      return result;
    } catch (err) {
      // Deep probe itself failed (network, LLM error). Don't trip unhealthy
      // on this — the shallow probe will catch real outages.
      console.warn(
        `[AppHealth] Deep probe (${reason}) errored: ${toErrorMessage(err)} — ignoring`,
      );
      return { healthy: true, reason: "deep probe errored, ignoring" };
    } finally {
      this.deepProbeInFlight = false;
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
    if (this.paused) return { ok: false, detail: "monitor paused — orchestrator handling restart" };
    if (!this.onRecover) {
      console.warn(`[AppHealth] No recovery callback registered — staying paused`);
      return { ok: false, detail: "no recovery callback" };
    }
    const cb = this.onRecover;
    const hint = this.lastUnhealthyReason;
    this.recoveryInFlight = (async () => {
      try {
        console.log(
          `[AppHealth] Triggering recovery${hint ? ` — hint: ${hint}` : ""}...`,
        );
        const result = await cb(hint);
        if (result.ok) {
          // Probe immediately to confirm and open the gate
          this.consecutiveFailures = 0;
          this.lastUnhealthyReason = undefined;
          this.deepUnhealthy = false; // recovery succeeded — clear deep hold
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
