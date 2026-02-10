import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';
import { AuthService, JwtProcessorType } from '../auth/auth.service';

export type McpAuthMode = 'none' | 'jwt' | 'session';

type McpSessionState = NonNullable<FastifyRequest['session']['mcp']>;

@Injectable()
export class McpAuthService {
  private static readonly AUTH_HEADER = 'authorization';
  private static readonly BEARER_PREFIX = 'bearer';

  private readonly log = new Logger(McpAuthService.name);

  private readonly authMode: McpAuthMode;
  private readonly jwtProcessor: JwtProcessorType;
  private readonly sessionTtlMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService
  ) {
    this.authMode = this.parseAuthMode(
      this.configService.get<string>('MCP_AUTH_MODE')
    );
    this.jwtProcessor = this.parseJwtProcessor(
      this.configService.get<string>('MCP_JWT_PROCESSOR')
    );
    this.sessionTtlMs = this.parseTtlMs(
      this.configService.get<string>('MCP_SESSION_TTL_MS')
    );

    this.log.debug(
      `MCP auth configured: mode=${this.authMode} jwtProcessor=${JwtProcessorType[this.jwtProcessor]} sessionTtlMs=${this.sessionTtlMs}`
    );
  }

  mode(): McpAuthMode {
    return this.authMode;
  }

  sessionTtlMsValue(): number {
    return this.sessionTtlMs;
  }

  /**
   * Returns a short, stable identifier for the authenticated principal (if any).
   * This is used only for session bookkeeping/logging.
   */
  extractUserId(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }
    const obj = payload as Record<string, unknown>;

    const sub = obj.sub;
    if (typeof sub === 'string' && sub.length) {
      return sub;
    }

    const email = obj.email;
    if (typeof email === 'string' && email.length) {
      return email;
    }

    const username = obj.username;
    if (typeof username === 'string' && username.length) {
      return username;
    }

    return undefined;
  }

  extractBearerToken(req: FastifyRequest): string | undefined {
    let token = req.headers[McpAuthService.AUTH_HEADER] as string | undefined;

    if (!token?.length) {
      // Mirrors the behavior of AuthGuard in this codebase.
      token =
        (req.cookies?.[McpAuthService.AUTH_HEADER] as string) || undefined;
    }

    if (token && this.isBearer(token)) {
      token = token.substring(McpAuthService.BEARER_PREFIX.length).trim();
    }

    return token?.length ? token : undefined;
  }

  async validateJwt(token: string): Promise<unknown> {
    return await this.authService.validateToken(token, this.jwtProcessor);
  }

  getSessionState(req: FastifyRequest): McpSessionState | undefined {
    return req.session?.mcp;
  }

  isSessionValid(req: FastifyRequest, nowMs: number = Date.now()): boolean {
    const s = this.getSessionState(req);
    if (!s) {
      return false;
    }
    if (!Number.isFinite(s.initializedAt) || !Number.isFinite(s.lastSeenAt)) {
      return false;
    }
    return nowMs - s.lastSeenAt <= this.sessionTtlMs;
  }

  async ensureSession(
    req: FastifyRequest,
    opts: { user?: string; nowMs?: number } = {}
  ): Promise<void> {
    const nowMs = opts.nowMs ?? Date.now();

    if (!req.session) {
      // Should never happen given @fastify/session registration, but avoid crashing.
      return;
    }

    if (!req.session.mcp) {
      req.session.mcp = {
        initializedAt: nowMs,
        lastSeenAt: nowMs,
        user: opts.user
      };
      await req.session.save();
      return;
    }

    // Refresh TTL / activity timestamp.
    req.session.mcp.lastSeenAt = nowMs;
    if (opts.user) {
      req.session.mcp.user = opts.user;
    }
    await req.session.save();
  }

  async clearSession(req: FastifyRequest): Promise<void> {
    if (!req.session) {
      return;
    }
    delete req.session.mcp;
    await req.session.save();
  }

  private isBearer(value: string): boolean {
    return value.toLowerCase().startsWith(McpAuthService.BEARER_PREFIX);
  }

  private parseAuthMode(value: string | undefined): McpAuthMode {
    const v = (value || 'none').toLowerCase().trim();
    if (v === 'none' || v === 'jwt' || v === 'session') {
      return v;
    }
    this.log.warn(`Unknown MCP_AUTH_MODE="${value}", defaulting to "none"`);
    return 'none';
  }

  private parseJwtProcessor(value: string | undefined): JwtProcessorType {
    const raw = (value || 'RSA').trim();
    const upper = raw.toUpperCase();

    // Allow either enum name ("RSA") or enum numeric string ("0").
    const asNumber = Number(raw);
    if (!Number.isNaN(asNumber) && JwtProcessorType[asNumber] !== undefined) {
      return asNumber as JwtProcessorType;
    }

    const mapped = (JwtProcessorType as unknown as Record<string, unknown>)[
      upper
    ];
    if (typeof mapped === 'number') {
      return mapped as JwtProcessorType;
    }

    this.log.warn(`Unknown MCP_JWT_PROCESSOR="${value}", defaulting to RSA`);
    return JwtProcessorType.RSA;
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
