import {
  Body,
  Controller,
  Get,
  Header,
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
import { IUserActionResult } from './api/IUserActionResult';
import { UsersService } from './users.service';

@Controller('/api/users')
export class UsersController {
  private log: Logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  @Options()
  @Header('Allow', 'OPTIONS, GET, POST, DELETE')
  async getTestOptions(): Promise<void> {}

  @Get('/:email')
  @ApiResponse({
    type: IUser,
  })
  async getUser(@Param('email') email: string): Promise<IUser> {
    this.log.debug('Called getUser');
    return IUser.convertToApi(await this.usersService.findByEmail(email));
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
