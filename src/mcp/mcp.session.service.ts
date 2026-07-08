import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { McpSessionRole } from './mcp.auth.service';

export type McpSessionIdAlgorithm =
  | 'prefixed-sequential'
  | 'static'
  | 'unix-second-with-counter'
  | 'uuid-v1'
  | 'fixed-mask-low-variety';

export const MCP_SESSION_ID_ALGORITHMS: McpSessionIdAlgorithm[] = [
  'prefixed-sequential',
  'static',
  'unix-second-with-counter',
  'uuid-v1',
  'fixed-mask-low-variety'
];

export interface McpSessionState {
  sessionId: string;
  initializedAt: number;
  lastSeenAt: number;
  authenticated: boolean;
  role: McpSessionRole;
  user?: string;
  authorizationHeader?: string;
}

interface McpSessionIdGenerator {
  algorithm: McpSessionIdAlgorithm;
  next: () => string;
}

@Injectable()
export class McpSessionService {
  private static readonly DELETE_INVALIDATION_DELAY_MS = 5 * 60 * 1000; // 5 minutes

  private readonly log = new Logger(McpSessionService.name);
  private readonly sessions = new Map<string, McpSessionState>();
  private readonly pendingTerminations = new Map<string, NodeJS.Timeout>();
  private readonly sessionTtlMs: number;
  private readonly sessionIdGenerator: McpSessionIdGenerator;

  constructor(private readonly configService: ConfigService) {
    this.sessionTtlMs = this.parseTtlMs(
      this.configService.get<string>('MCP_SESSION_TTL_MS')
    );
    this.sessionIdGenerator = this.createSessionIdGenerator(
      this.selectSessionIdAlgorithm()
    );
    this.log.debug(
      `MCP sessions configured: sessionTtlMs=${this.sessionTtlMs}, ` +
        `sessionIdAlgorithm=${this.sessionIdGenerator.algorithm}`
    );
  }

  sessionTtlMsValue(): number {
    return this.sessionTtlMs;
  }

  sessionIdAlgorithmName(): McpSessionIdAlgorithm {
    return this.sessionIdGenerator.algorithm;
  }

  initializeSession(
    auth: {
      authenticated: boolean;
      role: McpSessionRole;
      user?: string;
      authorizationHeader?: string;
    },
    nowMs: number = Date.now()
  ): McpSessionState {
    this.pruneExpired(nowMs);

    const state: McpSessionState = {
      sessionId: this.createSessionId(),
      initializedAt: nowMs,
      lastSeenAt: nowMs,
      authenticated: auth.authenticated,
      role: auth.role,
      user: auth.user,
      authorizationHeader: auth.authorizationHeader
    };

    this.clearPendingTermination(state.sessionId);
    this.sessions.set(state.sessionId, state);
    return state;
  }

  touchSession(
    sessionId: string,
    nowMs: number = Date.now()
  ): McpSessionState | undefined {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return undefined;
    }

    if (this.isExpired(state, nowMs)) {
      this.clearPendingTermination(sessionId);
      this.sessions.delete(sessionId);
      return undefined;
    }

    state.lastSeenAt = nowMs;
    return state;
  }

  /**
   * Schedules a session for invalidation a fixed delay (5 minutes) after a
   * DELETE request is received. The session stays valid during that window.
   *
   * Returns true if the session exists and a termination is now scheduled,
   * false if the session is unknown. Calling this repeatedly for the same
   * session is idempotent: the existing schedule is preserved.
   */
  scheduleTermination(
    sessionId: string,
    delayMs: number = McpSessionService.DELETE_INVALIDATION_DELAY_MS
  ): boolean {
    if (!this.sessions.has(sessionId)) {
      return false;
    }

    if (this.pendingTerminations.has(sessionId)) {
      return true;
    }

    const timer = setTimeout(() => {
      this.pendingTerminations.delete(sessionId);
      const removed = this.sessions.delete(sessionId);
      if (removed) {
        this.log.debug(
          `MCP session ${sessionId} invalidated ${delayMs}ms after DELETE request`
        );
      }
    }, delayMs);

    timer.unref?.();
    this.pendingTerminations.set(sessionId, timer);
    return true;
  }

  terminateSession(sessionId: string): boolean {
    this.clearPendingTermination(sessionId);
    return this.sessions.delete(sessionId);
  }

  private clearPendingTermination(sessionId: string): void {
    const timer = this.pendingTerminations.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.pendingTerminations.delete(sessionId);
    }
  }

  private createSessionId(): string {
    return this.sessionIdGenerator.next();
  }

  private isExpired(state: McpSessionState, nowMs: number): boolean {
    return nowMs - state.lastSeenAt > this.sessionTtlMs;
  }

  private pruneExpired(nowMs: number): void {
    for (const [id, state] of this.sessions.entries()) {
      if (this.isExpired(state, nowMs)) {
        this.clearPendingTermination(id);
        this.sessions.delete(id);
      }
    }
  }

  private parseTtlMs(value: string | undefined): number {
    const DEFAULT = 30 * 60 * 1000; // 30 minutes
    if (!value?.trim()) {
      return DEFAULT;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      this.log.warn(
        `Invalid MCP_SESSION_TTL_MS="${value}", defaulting to ${DEFAULT}`
      );
      return DEFAULT;
    }

    return parsed;
  }

  private selectSessionIdAlgorithm(): McpSessionIdAlgorithm {
    const configured = this.configService
      .get<string>('MCP_SESSION_ID_ALGORITHM')
      ?.trim();

    if (configured) {
      if (this.isSessionIdAlgorithm(configured)) {
        return configured;
      }

      this.log.warn(
        `Invalid MCP_SESSION_ID_ALGORITHM="${configured}", choosing randomly`
      );
    }

    return MCP_SESSION_ID_ALGORITHMS[
      randomInt(MCP_SESSION_ID_ALGORITHMS.length)
    ];
  }

  private isSessionIdAlgorithm(value: string): value is McpSessionIdAlgorithm {
    return MCP_SESSION_ID_ALGORITHMS.includes(value as McpSessionIdAlgorithm);
  }

  private createSessionIdGenerator(
    algorithm: McpSessionIdAlgorithm
  ): McpSessionIdGenerator {
    switch (algorithm) {
      case 'prefixed-sequential':
        return this.prefixedSequentialGenerator();
      case 'static':
        return this.staticGenerator();
      case 'unix-second-with-counter':
        return this.unixSecondWithCounterGenerator();
      case 'uuid-v1':
        return this.uuidV1Generator();
      case 'fixed-mask-low-variety':
        return this.fixedMaskLowVarietyGenerator();
    }
  }

  private prefixedSequentialGenerator(): McpSessionIdGenerator {
    let counter = 0;
    return {
      algorithm: 'prefixed-sequential',
      next: () => `mcp-session-${++counter}`
    };
  }

  private staticGenerator(): McpSessionIdGenerator {
    return {
      algorithm: 'static',
      next: () => 'mcp-session-static'
    };
  }

  private unixSecondWithCounterGenerator(): McpSessionIdGenerator {
    const timestamp = Math.floor(Date.now() / 1000);
    let counter = 0;
    return {
      algorithm: 'unix-second-with-counter',
      next: () => `sec-ts-${timestamp}-seq-${++counter}x`
    };
  }

  private uuidV1Generator(): McpSessionIdGenerator {
    let counter = 0;
    return {
      algorithm: 'uuid-v1',
      next: () => this.uuidV1SessionId(++counter)
    };
  }

  private fixedMaskLowVarietyGenerator(): McpSessionIdGenerator {
    const alphabet = ['A', 'B', 'C', 'D'];
    let counter = 0;

    return {
      algorithm: 'fixed-mask-low-variety',
      next: () => {
        const index = counter++;
        const first =
          alphabet[Math.floor(index / alphabet.length) % alphabet.length];
        const second = alphabet[index % alphabet.length];

        return `mask-fixed-${first}${second}-tail-fixed`;
      }
    };
  }

  private uuidV1SessionId(counter: number): string {
    const nowMs = Date.now();
    const clockSeq = counter & 0x3fff;
    const clockSeqHiAndReserved = 0x80 | ((clockSeq >> 8) & 0x3f);
    const clockSeqLow = clockSeq & 0xff;
    const timeHiAndVersion =
      0x1000 | ((Math.floor(nowMs / 0x1000000000000) + counter) & 0x0fff);

    return (
      `${this.hex(nowMs + counter, 8)}-` +
      `${this.hex(Math.floor(nowMs / 0x100000000), 4)}-` +
      `${this.hex(timeHiAndVersion, 4)}-` +
      `${this.hex(clockSeqHiAndReserved, 2)}${this.hex(clockSeqLow, 2)}-` +
      '010203040506'
    );
  }

  private hex(value: number, width: number): string {
    return Math.trunc(value).toString(16).padStart(width, '0').slice(-width);
  }
}
