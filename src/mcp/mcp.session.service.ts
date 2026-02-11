import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { McpSessionRole } from './mcp.auth.service';

export interface McpSessionState {
  sessionId: string;
  initializedAt: number;
  lastSeenAt: number;
  authenticated: boolean;
  role: McpSessionRole;
  user?: string;
  authorizationHeader?: string;
}

@Injectable()
export class McpSessionService {
  private readonly log = new Logger(McpSessionService.name);
  private readonly sessions = new Map<string, McpSessionState>();
  private readonly sessionTtlMs: number;

  constructor(private readonly configService: ConfigService) {
    this.sessionTtlMs = this.parseTtlMs(
      this.configService.get<string>('MCP_SESSION_TTL_MS')
    );
    this.log.debug(
      `MCP sessions configured: sessionTtlMs=${this.sessionTtlMs}`
    );
  }

  sessionTtlMsValue(): number {
    return this.sessionTtlMs;
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
      this.sessions.delete(sessionId);
      return undefined;
    }

    state.lastSeenAt = nowMs;
    return state;
  }

  terminateSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  private createSessionId(): string {
    // UUIDs are globally unique, cryptographically secure and visible ASCII.
    let sessionId = randomUUID();
    while (this.sessions.has(sessionId)) {
      sessionId = randomUUID();
    }
    return sessionId;
  }

  private isExpired(state: McpSessionState, nowMs: number): boolean {
    return nowMs - state.lastSeenAt > this.sessionTtlMs;
  }

  private pruneExpired(nowMs: number): void {
    for (const [id, state] of this.sessions.entries()) {
      if (this.isExpired(state, nowMs)) {
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
}
