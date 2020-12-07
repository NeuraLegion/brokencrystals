import { Body, Controller, Logger, Post } from '@nestjs/common';
import { LoginRequest } from './api/login.request';
import { LoginResponse } from './api/LoginResponse';

@Controller('/api/auth')
export class AuthController {
  private log: Logger = new Logger(AuthController.name);

  @Post()
  async login(@Body() req: LoginRequest): Promise<LoginResponse> {
    return null;
  }
}
