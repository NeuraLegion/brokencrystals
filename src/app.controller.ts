import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { AppConfig } from './app.config.api';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@ApiTags('app')
@Controller('api')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('config')
  @Header('Cache-Control', 'no-store')
  getConfig(): AppConfig {
    return this.appService.getConfig();
  }
}
