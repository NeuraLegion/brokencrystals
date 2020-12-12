import {
  CanActivate,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  private static readonly AUTH_HEADER = 'Authorization';
  private log: Logger = new Logger(AuthGuard.name);
  constructor(private readonly authService: AuthService) {}

  async canActivate(context) {
    this.log.debug('Called canActivate');
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
      return (await this.authService.validateToken(token)) && true;
    }
    catch (err) {
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
