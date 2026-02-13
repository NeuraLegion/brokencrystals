import { Module } from '@nestjs/common';
import { PartnersService } from './partners.service';
import { PartnersController } from './partners.controller';

@Module({
  providers: [PartnersService],
  controllers: [PartnersController],
  exports: [PartnersService]
})
export class PartnersModule {}
