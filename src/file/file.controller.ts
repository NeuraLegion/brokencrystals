import {
  Controller,
  Get,
  Header,
  Logger,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { FileService } from './file.service';
import { ReadableStreamBuffer } from 'stream-buffers';
import { Stream } from 'stream';
import { Request, Response } from 'express';

@Controller('file')
export class FileController {
  private static readonly CONTENT_TYPE_HEADER = 'Content-Type';
  private log: Logger = new Logger(FileController.name);

  constructor(private fileService: FileService) {}

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
}
