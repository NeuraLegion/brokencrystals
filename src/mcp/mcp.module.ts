import { Module, forwardRef } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { TestimonialsModule } from '../testimonials/testimonials.module';
import { UsersModule } from '../users/users.module';
import { AppService } from '../app.service';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { McpAuthService } from './mcp.auth.service';

@Module({
  imports: [TestimonialsModule, UsersModule, forwardRef(() => AuthModule)],
  controllers: [McpController],
  providers: [McpService, McpAuthService, AppService, ConfigService]
})
export class McpModule {}
