import {
  Injectable,
  CanActivate,
  UnauthorizedException,
  ExecutionContext,
  Logger
} from '@nestjs/common';
import { createHash } from 'crypto';
import { FastifyRequest } from 'fastify';
import { FormMode, LoginRequest } from './api/login.request';

@Injectable()
export class CsrfGuard implements CanActivate {
  async canActivate() {
    return true;
  }
}
