import {
  Controller,
  Delete,
  Get,
  Header,
  HttpException,
  HttpStatus,
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
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';

@Controller('/api/file')
@ApiTags('files controller')
export class FileController {
  private static readonly CONTENT_TYPE_HEADER = 'Content-Type';
  private log: Logger = new Logger(FileController.name);

  constructor(private fileService: FileService) {}

  @ApiOperation({
    description:
      'Reads the file from the provided path and the supplied content type and returns the file',
  })
  @Get()
  async loadFile(
    @Query('path') path: string,
    @Query('type') contentType: string,
    @Res() response: Response,
  ): Promise<void> {
    try {
      if (!contentType) {
        contentType = 'application/octet-stream';
      }
      response.header(FileController.CONTENT_TYPE_HEADER, contentType);
      const file: Stream = await this.fileService.getFile(path);
      file.pipe(response);
    } catch (err) {
      throw new HttpException(
        {
          error: err.message,
          location: __filename,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({
    description: 'deletes file at the given path',
  })
  @Delete()
  async deleteFile(@Query('path') path: string): Promise<void> {
    try {
      this.fileService.deleteFile(path);
    } catch (err) {
      throw new HttpException(
        {
          error: err.message,
          location: __filename,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiProperty({
    description: 'Upload file to server using multipart form upload',
  })
  @Put('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file) {
    console.log(file);
    this.uploadFile;
    //TODO complete
  }
}
