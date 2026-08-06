import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { HttpClientModule } from '../httpclient/httpclient.module';
import { OrmModule } from '../orm/orm.module';

@Module({
  imports: [HttpClientModule, OrmModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: []
})
export class ChatModule {}
