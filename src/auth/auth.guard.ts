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

      const request: FastifyRequest = context.switchToHttp().getRequest();
      const token = request.headers[AuthGuard.AUTH_HEADER] as string;

      if (!token || token.length == 0) {
        const token = request.cookies[AuthGuard.AUTH_HEADER];

        if (token) {
          return !!(await this.authService.validateToken(
            token,
            JwtProcessorType.BEARER,
          ));
        } else {
          throw new UnauthorizedException();
        }
      } else if (this.checkIsBearer(token)) {
        return !!(await this.authService.validateToken(
          token.substring(7),
          JwtProcessorType.BEARER,
        ));
      } else {
        const processorType: JwtProcessorType = this.reflector.get<JwtProcessorType>(
          JwTypeMetadataField,
          context.getHandler(),
        );
        return !!(await this.authService.validateToken(token, processorType));
      }
    } catch (err) {
      this.logger.debug(`Failed to validate token: ${err.message}`);
      throw new UnauthorizedException({
        error: 'Unauthorized',
        line: __filename,
      });
    }
  }

  private checkIsBearer(bearer: string): boolean {
    if (!bearer || bearer.length < 10) {
      return false;
    }
    const prefix = bearer.substring(0, 7).toLowerCase();
    if (prefix !== 'bearer ') {
      return false;
    }
    return true;
  }
}
