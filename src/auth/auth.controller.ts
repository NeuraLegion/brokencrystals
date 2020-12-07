import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { LdapQueryHandler } from 'src/users/ldap.query.handler';
import { UsersService } from 'src/users/users.service';
import { LoginRequest } from './api/login.request';
import { LoginResponse } from './api/LoginResponse';
import { hashPassword } from './credentials.utils';

@Controller('/api/auth')
export class AuthController {
  private log: Logger = new Logger(AuthController.name);

  constructor(private readonly usersService: UsersService) {}

  @Post()
  async login(@Body() req: LoginRequest): Promise<LoginResponse> {
    let user = await this.usersService.findByEmail(req.user);
    if (!user || user.password !== (await hashPassword(req.password))) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }
    return {
      email: user.email,
      ldapProfileLink: LdapQueryHandler.LDAP_SEARCH_QUERY(user.email),
    };
  }
}
