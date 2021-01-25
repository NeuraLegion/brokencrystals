import { Module } from '@nestjs/common';
import { HttpClientModule } from '../httpclient/httpclient.module';
import { UsersModule } from '../users/users.module';
import { FileController } from './file.controller';
import { FileService } from './file.service';

@Module({
  imports: [UsersModule, HttpClientModule],
  controllers: [FileController],
  providers: [FileService],
})
export class FileModule {}
