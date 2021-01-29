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
    this.logger.debug('Called canActivate');
    const processorType: JwtProcessorType = this.reflector.get<JwtProcessorType>(
      JwTypeMetadataField,
      context.getHandler(),
    );

    const request: FastifyRequest = context.switchToHttp().getRequest();
    const token = request.headers[AuthGuard.AUTH_HEADER] as string;
    if (!token || token.length == 0) {
      this.logger.debug('Authorization header is missing');
      throw new UnauthorizedException({
        error: 'Unauthorized',
        line: __filename,
      });
    }
    try {
      return !!(await this.authService.validateToken(token, processorType));
    } catch (err) {
      this.logger.debug(`Failed to validate token: ${err.message}`);
      throw new UnauthorizedException({
        error: 'Unauthorized',
        line: __filename,
      });
    }
  }
}
