import {
  Injectable,
  CanActivate,
  UnauthorizedException,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { FastifyRequest } from 'fastify';
import { FormMode, LoginRequest } from './api/login.request';

@Injectable()
export class CsrfGuard implements CanActivate {
  private static readonly CSRF_COOKIE_HEADER = '_csrf';
  private readonly logger = new Logger(CsrfGuard.name);

  async canActivate(context: ExecutionContext) {
    this.logger.debug('Called canActivate');

    const request: FastifyRequest = context.switchToHttp().getRequest();

    try {
      const body: LoginRequest = request.body as LoginRequest;
      const mode = body?.op;
      if (mode === FormMode.CSRF || mode === FormMode.DOM_BASED_CSRF) {
        const csrfCookie = request.cookies[CsrfGuard.CSRF_COOKIE_HEADER];

        if (decodeURIComponent(csrfCookie) !== body.csrf) {
          this.throwError();
        }

        if (mode === FormMode.DOM_BASED_CSRF && !body.fingerprint) {
          const fpHash = createHash('md5')
            .update(body.fingerprint)
            .digest('hex');
          if (body.csrf !== fpHash) {
            this.throwError();
          }
        }
      }

      return true;
    } catch (err) {
      this.logger.debug(`Failed to validate cookie: ${err.message}`);
      this.throwError();
    }
  }

  private throwError() {
    throw new UnauthorizedException({
      error: 'Invalid credentials',
      location: __filename,
    });
  }
}
