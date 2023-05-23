import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrmModule } from '../orm/orm.module';
import { UsersModule } from '../users/users.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductsResolver } from './products.resolver';

@Module({
  imports: [OrmModule, AuthModule, UsersModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsResolver],
  exports: [ProductsService],
})
export class ProductsModule {}
