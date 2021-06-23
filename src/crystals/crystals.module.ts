import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrmModule } from '../orm/orm.module';
import { UsersModule } from '../users/users.module';
import { CrystalsController } from './crystals.controller';
import { CrystalsService } from './crystals.service';

@Module({
  imports: [OrmModule, AuthModule, UsersModule],
  controllers: [CrystalsController],
  providers: [CrystalsService],
  exports: [CrystalsService],
})
export class CrystalsModule {}
