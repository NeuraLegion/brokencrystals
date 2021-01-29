import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Logger,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { W_OK } from 'constants';
import * as fs from 'fs';
import * as path from 'path';
import * as rawbody from 'raw-body';
import { Stream } from 'stream';
import { FileService } from './file.service';
import { FastifyReply } from 'fastify';

@Controller('/api/file')
@ApiTags('files controller')
export class FileController {
  private static readonly CONTENT_TYPE_HEADER = 'content-type';
  private readonly logger = new Logger(FileController.name);

  constructor(private fileService: FileService) {}

  @ApiOperation({
    description:
      'Reads the file from the provided path and the supplied content type and returns the file',
  })
  @Get()
  async loadFile(
    @Query('path') path: string,
    @Query('type') contentType: string,
    @Res({ passthrough: true }) res: FastifyReply,
    @Headers('accept') acceptHeader: string,
  ): Promise<void> {
    let type: string;

    if (contentType) {
      type = contentType;
    } else if (acceptHeader) {
      type = acceptHeader;
    } else {
      type = 'application/octet-stream';
    }

    const file: Stream = await this.fileService.getFile(path);
    res.type(type).send(file);
  }

  @ApiOperation({
    description: 'deletes file at the given path',
  })
  @Delete()
  async deleteFile(@Query('path') path: string): Promise<void> {
    await this.fileService.deleteFile(path);
  }

  @ApiOperation({
    description: 'save raw content on server as a file',
  })
  @Put('raw')
  async uploadFile(
    @Body() data,
    @Query('path') file,
    @Req() req,
  ): Promise<void> {
    if (req.readable) {
      const raw = await rawbody(req);
      try {
        await fs.promises.access(path.dirname(file), W_OK);
        await fs.promises.writeFile(file, raw);
      } catch (err) {
        this.logger.error(err.message);
      }
    }
  }

  @ApiOperation({
    description: 'read file content content on server as a file',
  })
  @Get('raw')
  async readFile(
    @Query('path') file,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<void> {
    try {
      const stream = await this.fileService.getFile(file);
      res.type('application/octet-stream').send(stream);
    } catch (err) {
      this.logger.error(err.message);
      res.status(HttpStatus.NOT_FOUND);
    }
  }
}
