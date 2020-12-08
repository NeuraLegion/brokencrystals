import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Res,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response, response } from 'express';
import { User } from 'src/model/user.entity';
import { LdapQueryHandler } from 'src/users/ldap.query.handler';
import { UsersService } from 'src/users/users.service';
import { LoginRequest } from './api/login.request';
import { LoginResponse } from './api/LoginResponse';
import { passwordMatches } from './credentials.utils';

@Controller('/api/auth')
@ApiTags('auth controller')
export class AuthController {
  private log: Logger = new Logger(AuthController.name);

  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiResponse({
    type: LoginResponse,
    status: HttpStatus.OK,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'invliad credentials',
  })
  async login(@Body() req: LoginRequest, @Res() response: Response): Promise<void> {
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
    if (!user || !(await passwordMatches(req.password, user.password))) {
      throw new HttpException(
        {
          error: 'Invalid credentials',
          location: __filename,
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
    response.header('Authorization', 'jwttoken-1');
    response.json({
      email: user.email,
      ldapProfileLink: LdapQueryHandler.LDAP_SEARCH_QUERY(user.email),
    }).end();
  }
}
