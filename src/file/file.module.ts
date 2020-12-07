import { Module } from '@nestjs/common';
import { UsersModule } from 'src/users/users.module';
import { UsersService } from 'src/users/users.service';
import { FileController } from './file.controller';
import { FileService } from './file.service';

@Module({
  imports: [UsersModule],
  controllers: [FileController],
  providers: [FileService],
})
export class FileModule {}
