import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [forwardRef(() => UsersModule)],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService]
})
export class AuthModule {}
