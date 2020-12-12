import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { AuthService } from 'src/auth/auth.service';
import { OrmModule } from 'src/orm/orm.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [OrmModule, forwardRef(() => AuthModule)],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
