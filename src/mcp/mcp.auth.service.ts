import { Injectable } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AuthService, JwtProcessorType } from '../auth/auth.service';
import { UsersService } from '../users/users.service';

export type McpSessionRole = 'guest' | 'user' | 'admin';

export interface McpAuthContext {
  authenticated: boolean;
  role: McpSessionRole;
  user?: string;
  authorizationHeader?: string;
}

@Injectable()
export class McpAuthService {
  private static readonly AUTH_HEADER = 'authorization';
  private static readonly BEARER_PREFIX = 'bearer';

  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService
  ) {}

  async resolveAuthContext(req: FastifyRequest): Promise<McpAuthContext> {
    const token = this.extractBearerToken(req);
    if (!token) {
      return {
        authenticated: false,
        role: 'guest'
      };
    }

    const payload = await this.validateJwt(token);
    const user = this.extractUserId(payload);
    const role = await this.resolveRole(user);

    return {
      authenticated: true,
      role,
      user,
      authorizationHeader: `Bearer ${token}`
    };
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

    const user = obj.user;
    if (typeof user === 'string' && user.length) {
      return user;
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
    return await this.authService.validateToken(token, JwtProcessorType.RSA);
  }

  async resolveRole(user?: string): Promise<McpSessionRole> {
    if (!user) {
      return 'user';
    }

    try {
      const found = await this.usersService.findByEmail(user);
      return found.isAdmin ? 'admin' : 'user';
    } catch {
      // Keep authenticated session usable even if a DB user cannot be resolved.
      return 'user';
    }
  }

  private isBearer(value: string): boolean {
    return value.toLowerCase().startsWith(McpAuthService.BEARER_PREFIX);
  }
}
