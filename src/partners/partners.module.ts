import { Module } from '@nestjs/common';
import { PartnersService } from './partners.service';

@Module({
  providers: [PartnersService],
  exports: [PartnersService],
})
export class PartnersModule { }
