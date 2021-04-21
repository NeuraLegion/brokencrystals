import { forwardRef, Module } from '@nestjs/common';
import { HttpClientService } from '../httpclient/httpclient.service';
import { AuthModule } from '../auth/auth.module';
import { OrmModule } from '../orm/orm.module';
import { KeyCloakService } from './keycloak.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [OrmModule, forwardRef(() => AuthModule)],
  controllers: [UsersController],
  providers: [UsersService, KeyCloakService, HttpClientService],
  exports: [UsersService, KeyCloakService, HttpClientService],
})
export class UsersModule {}
