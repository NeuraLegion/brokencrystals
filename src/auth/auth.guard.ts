import {
  CanActivate,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService, JwtProcessorType } from './auth.service';
import { JwTypeMetadataField } from './jwt/jwt.type.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  private static readonly AUTH_HEADER = 'Authorization';
  private log: Logger = new Logger(AuthGuard.name);
  constructor(
    private readonly authService: AuthService,
    private reflector: Reflector,
  ) {}

  async canActivate(context) {
    this.log.debug('Called canActivate');
    const processorType: JwtProcessorType = this.reflector.get<JwtProcessorType>(
      JwTypeMetadataField,
      context.getHandler(),
    );

    const request: Request = context.switchToHttp().getRequest();
    const token = request.header(AuthGuard.AUTH_HEADER);
    if (!token || token.length == 0) {
      this.log.debug('Authorization header is missing');
      throw new HttpException(
        {
          error: 'Unauthorized',
          line: __filename,
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
    try {
      return (
        (await this.authService.validateToken(token, processorType)) && true
      );
    } catch (err) {
      this.log.debug(`Failed to validate token: ${err.message}`);
      throw new HttpException(
        {
          error: 'Unauthorized',
          line: __filename,
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
