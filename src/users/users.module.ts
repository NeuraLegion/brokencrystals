import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrmModule } from '../orm/orm.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [OrmModule, forwardRef(() => AuthModule)],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
