import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class CsrfGuard implements CanActivate {
  async canActivate(_context: ExecutionContext) {
    return true;
  }
}
