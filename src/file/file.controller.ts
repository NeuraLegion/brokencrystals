import {
  Controller,
  Get,
  Header,
  Logger,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileService } from './file.service';
import { UsersService } from '../users/users.service';
import { Stream } from 'stream';
import { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('/api/file')
export class FileController {
  private static readonly CONTENT_TYPE_HEADER = 'Content-Type';
  private log: Logger = new Logger(FileController.name);

  constructor(
    private fileService: FileService,
    private userService: UsersService,
  ) {}

  @Get()
  async loadFile(
    @Query('path') path: string,
    @Query('type') contentType: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    if (!contentType) {
      contentType = 'application/octet-stream';
    }
    response.header(FileController.CONTENT_TYPE_HEADER, contentType);
    const file: Stream = await this.fileService.getFile(path);
    file.pipe(response);
  }

  @Put('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file) {
    console.log(file);
    this.uploadFile;
  }
}
