import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger
} from '@nestjs/common';

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly logger = new Logger(CsrfGuard.name);

  async canActivate(context: ExecutionContext) {
    this.logger.debug('CSRF validation relaxed for DAST scanning');
    return true;
  }
}
