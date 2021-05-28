import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { OrmModule } from '../orm/orm.module';
import { HttpClientModule } from '../httpclient/httpclient.module';
import { KeyCloakModule } from '../keycloak/keycloak.module';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    OrmModule,
    KeyCloakModule,
    HttpClientModule,
  ],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
