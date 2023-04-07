import {
  CanActivate,
  Injectable,
  Logger,
  UnauthorizedException,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService, JwtProcessorType } from './auth.service';
import { JwTypeMetadataField } from './jwt/jwt.type.decorator';
import { FastifyRequest } from 'fastify';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';

@Injectable()
export class AuthGuard implements CanActivate {
  private static readonly AUTH_HEADER = 'authorization';
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    try {
      this.logger.debug('Called canActivate');
      const request = this.getRequest(context);

      return !!(await this.verifyToken(request, context));
    } catch (err) {
      this.logger.debug(`Failed to validate token: ${err.message}`);
      throw new UnauthorizedException({
        error: 'Unauthorized',
        line: __filename,
      });
    }
  }

  private getRequest(context: ExecutionContext): FastifyRequest {
    return context.getType<GqlContextType>() === 'graphql'
      ? GqlExecutionContext.create(context).getContext().req
      : context.switchToHttp().getRequest();
  }

  private async verifyToken(
    request: FastifyRequest,
    context: ExecutionContext,
  ): Promise<boolean> {
    let token = request.headers[AuthGuard.AUTH_HEADER];

    if (!token?.length) {
      token = request.cookies[AuthGuard.AUTH_HEADER];
    }

    if (this.checkIsBearer(token)) {
      token = token.substring(7);
    }

    if (!token?.length) {
      return false;
    }

    const processorType = this.reflector.get<JwtProcessorType>(
      JwTypeMetadataField,
      context.getHandler(),
    );

    return this.authService.validateToken(
      token,
      processorType ?? JwtProcessorType.BEARER,
    );
  }

  private checkIsBearer(bearer: string): boolean {
    if (!bearer || bearer.length < 10) {
      return false;
    }

    const prefix = bearer.substring(0, 7).toLowerCase();

    return prefix === 'bearer ';
  }
}
