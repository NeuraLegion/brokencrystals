import { Module, forwardRef } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { McpAuthService } from './mcp.auth.service';
import { McpResourceExecutorService } from './mcp.resource-executor.service';
import { McpSessionService } from './mcp.session.service';
import { McpToolExecutorService } from './mcp.tool-executor.service';

@Module({
  imports: [UsersModule, forwardRef(() => AuthModule)],
  controllers: [McpController],
  providers: [
    McpService,
    McpAuthService,
    McpSessionService,
    McpToolExecutorService,
    McpResourceExecutorService
  ]
})
export class McpModule {}
