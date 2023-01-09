import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { UsersService } from './users.service';
import { FastifyRequest } from 'fastify';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: FastifyRequest = context.switchToHttp().getRequest();
    const email = request.params['email'] as string;
    const permissions = await this.users.getPermissions(email);
    return permissions.isAdmin;
  }
}
