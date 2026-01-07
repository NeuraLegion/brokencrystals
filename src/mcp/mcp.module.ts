import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { TestimonialsModule } from '../testimonials/testimonials.module';
import { UsersModule } from '../users/users.module';
import { AppService } from '../app.service';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [TestimonialsModule, UsersModule],
  controllers: [McpController],
  providers: [McpService, AppService, ConfigService]
})
export class McpModule {}
