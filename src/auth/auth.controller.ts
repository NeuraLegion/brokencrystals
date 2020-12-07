import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
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
      ldapProfileLink: `(&(objectClass=person)(objectClass=user)(email=${user.email}))`,
    };
  }
}
