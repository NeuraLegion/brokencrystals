import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrmModule } from '../orm/orm.module';
import { UsersModule } from '../users/users.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [OrmModule, AuthModule, UsersModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
