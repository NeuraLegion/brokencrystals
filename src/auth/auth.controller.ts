import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { User } from 'src/model/user.entity';
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
    let user: User;
    try {
      user = await this.usersService.findByEmail(req.user);
    } catch (err) {
      throw new HttpException(
        {
          error: err.message,
          location: __filename,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!user || user.password !== (await hashPassword(req.password))) {
      throw new HttpException(
        {
          error: 'Invalid credentials',
          location: __filename,
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
    return {
      email: user.email,
      ldapProfileLink: LdapQueryHandler.LDAP_SEARCH_QUERY(user.email),
    };
  }
}
