import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from 'src/users/users.module';
import { OrmModule } from 'src/orm/orm.module';
import { HttpClientModule } from 'src/httpclient/httpclient.module';

@Module({
  imports: [forwardRef(() => UsersModule), OrmModule, HttpClientModule],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
