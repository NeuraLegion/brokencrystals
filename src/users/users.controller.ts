import {
  Body,
  Controller,
  Get,
  Header,
  Options,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { query } from 'express';
import { createSecureServer } from 'http2';
import { IUser } from './api/IUser';
import { IUserActionResult } from './api/IUserActionResult';

@Controller('/api/users')
export class UsersController {
  @Options()
  @Header('Allow', 'OPTIONS, GET, POST, DELETE')
  async getTestOptions(): Promise<void> {}

  @Get()
  @ApiResponse({
    isArray: true,
    type: IUser,
  })
  async getUsers(): Promise<IUser[]> {
    return null;
  }

  @Get('/:id')
  @ApiResponse({
    type: IUser,
  })
  async getUser(@Param('id') id: string): Promise<IUser> {
    return null;
  }

  @Post()
  @ApiResponse({
    type: IUser,
  })
  async createUser(@Body() user: IUser): Promise<IUser> {
    return null;
  }

  @Post()
  @ApiResponse({
    type: IUserActionResult,
  })
  async deleteUser(): Promise<IUserActionResult> {
    return { success: true };
  }

  @Post()
  async logUserLoginTime(@Query('time') time: string): Promise<string> {
    console.log(time);
    return time;
  }
}
