import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Logger,
  Options,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { query } from 'express';
import { createSecureServer } from 'http2';
import { CreateUserRequest } from './api/CreateUserRequest';
import { IUser } from './api/IUser';
import { LdapQueryHandler } from './ldap.query.handler';
import { UsersService } from './users.service';

@Controller('/api/users')
export class UsersController {
  private log: Logger = new Logger(UsersController.name);
  private ldapQueryHandler: LdapQueryHandler = new LdapQueryHandler();

  constructor(private readonly usersService: UsersService) {}

  @Options()
  @Header('Allow', 'OPTIONS, GET, POST, DELETE')
  async getTestOptions(): Promise<void> {}

  @Get('/one/:email')
  @ApiResponse({
    type: IUser,
  })
  async getUser(@Param('email') email: string): Promise<IUser> {
    this.log.debug('Called getUser');
    return IUser.convertToApi(await this.usersService.findByEmail(email));
  }

  @Get('/ldap')
  async ldapQuery(@Query('query') query: string): Promise<IUser> {
    try {
      let email = this.ldapQueryHandler.parseQuery(query);
      let user =await this.usersService.findByEmail(email);
      if (!user) {
        throw new HttpException('User not found in ldap', HttpStatus.NOT_FOUND);
      }
      return IUser.convertToApi(user);
    } catch (err) {
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post()
  @ApiResponse({
    type: IUser,
  })
  async createUser(@Body() user: CreateUserRequest): Promise<IUser> {
    this.log.debug('Called createUser');
    return IUser.convertToApi(
      await this.usersService.createUser(
        user.email,
        user.lastName,
        user.firstName,
        user.password,
      ),
    );
  }
}
