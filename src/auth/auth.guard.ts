import {
  CanActivate,
  Injectable,
  Logger,
  UnauthorizedException,
  ExecutionContext
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService, JwtProcessorType } from './auth.service';
import { JwTypeMetadataField } from './jwt/jwt.type.decorator';
import { FastifyRequest } from 'fastify';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';

@Injectable()
export class AuthGuard implements CanActivate {
  private static readonly AUTH_HEADER = 'authorization';
  private static readonly BEARER_PREFIX = 'bearer';
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext) {
    try {
      this.logger.debug('Called canActivate');
      const request = this.getRequest(context);
      const token = this.extractToken(request);

      if (!token) {
        return false;
      }

      return await this.verifyToken(token, context);
    } catch (err) {
      this.logger.debug(`Failed to validate token: ${err.message}`);
      throw new UnauthorizedException({
        error: 'Unauthorized',
        line: __filename
      });
    }
  }

  private extractToken(request: FastifyRequest): string | undefined {
    const headerToken = request.headers[AuthGuard.AUTH_HEADER];
    const cookieToken = request.cookies?.[AuthGuard.AUTH_HEADER];
    const token = this.normalizeToken(
      typeof headerToken === 'string' ? headerToken : cookieToken
    );

    return token;
  }

  private normalizeToken(token?: string): string | undefined {
    if (!token?.length) {
      return undefined;
    }

    const trimmed = token.trim();
    if (this.checkIsBearer(trimmed)) {
      const bearerToken = trimmed.substring(AuthGuard.BEARER_PREFIX.length).trim();
      return bearerToken.length ? bearerToken : undefined;
    }

    return trimmed.length ? trimmed : undefined;
  }

  private getRequest(context: ExecutionContext): FastifyRequest {
    return context.getType<GqlContextType>() === 'graphql'
      ? GqlExecutionContext.create(context).getContext().req
      : context.switchToHttp().getRequest();
  }

  private async verifyToken(
    token: string,
    context: ExecutionContext
  ): Promise<boolean> {
    const processorType = this.reflector.get<JwtProcessorType>(
      JwTypeMetadataField,
      context.getHandler()
    );

    if (processorType === undefined || processorType === null) {
      throw new UnauthorizedException({
        error: 'Unauthorized',
        line: __filename
      });
    }

    if (!this.isAllowedProcessorType(processorType)) {
      throw new UnauthorizedException({
        error: 'Unauthorized',
        line: __filename
      });
    }

    const decodedHeader = this.getJwtHeader(token);
    if (!decodedHeader?.alg || decodedHeader.alg.toLowerCase() === 'none') {
      throw new UnauthorizedException({
        error: 'Unauthorized',
        line: __filename
      });
    }

    return !!(await this.authService.validateToken(token, processorType));
  }

  private getJwtHeader(token: string): { alg?: string } | undefined {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[0]) {
      return undefined;
    }

    try {
      const normalized = parts[0].replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      const headerJson = Buffer.from(padded, 'base64').toString('utf8');
      return JSON.parse(headerJson);
    } catch {
      return undefined;
    }
  }

  private isAllowedProcessorType(processorType: JwtProcessorType): boolean {
    return Object.values(JwtProcessorType).includes(processorType);
  }

  private checkIsBearer(bearer: string): boolean {
    return (
      !!bearer &&
      bearer.toLowerCase().startsWith(AuthGuard.BEARER_PREFIX.toLowerCase())
    );
  }
}
