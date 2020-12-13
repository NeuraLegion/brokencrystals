import { Module } from '@nestjs/common';
import { HttpClientService } from './httpclient.service';

@Module({
  providers: [HttpClientService],
  exports: [HttpClientService],
})
export class HttpClientModule {}
