import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Logger,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { W_OK } from 'constants';
import * as fs from 'fs';
import * as path from 'path';
import { Stream } from 'stream';
import { FileService } from './file.service';
import { FastifyReply } from 'fastify';
import {
  SWAGGER_DESC_DELETE_FILE,
  SWAGGER_DESC_READ_FILE,
  SWAGGER_DESC_READ_FILE_ON_SERVER,
  SWAGGER_DESC_SAVE_RAW_CONTENT,
} from './file.controller.swagger.desc';
import { CloudProvidersMetaData } from './cloud.providers.metadata';

@Controller('/api/file')
@ApiTags('Files controller')
export class FileController {
  private readonly logger = new Logger(FileController.name);

  constructor(private fileService: FileService) {}

  private getContentType(contentType: string, acceptHeader: string) {
    if (contentType) {
      return contentType;
    } else if (acceptHeader) {
      return acceptHeader;
    } else {
      return 'application/octet-stream';
    }
  }

  private async loadCPFile(cpBaseUrl: string, path: string) {
    if (!path.startsWith(cpBaseUrl)) {
      throw new BadRequestException(`Invalid paramater 'path' ${path}`);
    }

    const file: Stream = await this.fileService.getFile(path);

    return file;
  }

  @Get()
  @ApiQuery({
    name: 'path',
    example: 'config/products/crystals/amethyst.jpg',
    required: true,
  })
  @ApiQuery({ name: 'type', example: 'image/jpg', required: true })
  @ApiHeader({ name: 'accept', example: 'image/jpg', required: true })
  @ApiOkResponse({
    description: 'File read successfully',
  })
  @ApiInternalServerErrorResponse({
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
  })
  @ApiOperation({
    description: SWAGGER_DESC_READ_FILE,
  })
  async loadFile(
    @Query('path') path: string,
    @Query('type') contentType: string,
    @Res({ passthrough: true }) res: FastifyReply,
    @Headers('accept') acceptHeader: string,
  ) {
    const file: Stream = await this.fileService.getFile(path);
    const type = this.getContentType(contentType, acceptHeader);
    res.type(type);

    return file;
  }

  @Get('/google')
  @ApiQuery({
    name: 'path',
    example: 'config/products/crystals/amethyst.jpg',
    required: true,
  })
  @ApiQuery({ name: 'type', example: 'image/jpg', required: true })
  @ApiHeader({ name: 'accept', example: 'image/jpg', required: true })
  @ApiOkResponse({
    description: 'File read successfully',
  })
  @ApiInternalServerErrorResponse({
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
  })
  @ApiOperation({
    description: SWAGGER_DESC_READ_FILE,
  })
  async loadGoogleFile(
    @Query('path') path: string,
    @Query('type') contentType: string,
    @Res({ passthrough: true }) res: FastifyReply,
    @Headers('accept') acceptHeader: string,
  ) {
    const file: Stream = await this.loadCPFile(
      CloudProvidersMetaData.GOOGLE,
      path,
    );
    const type = this.getContentType(contentType, acceptHeader);
    res.type(type);

    return file;
  }

  @Get('/aws')
  @ApiQuery({
    name: 'path',
    example: 'config/products/crystals/amethyst.jpg',
    required: true,
  })
  @ApiQuery({ name: 'type', example: 'image/jpg', required: true })
  @ApiHeader({ name: 'accept', example: 'image/jpg', required: true })
  @ApiOkResponse({
    description: 'File read successfully',
  })
  @ApiInternalServerErrorResponse({
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
  })
  @ApiOperation({
    description: SWAGGER_DESC_READ_FILE,
  })
  async loadAwsFile(
    @Query('path') path: string,
    @Query('type') contentType: string,
    @Res({ passthrough: true }) res: FastifyReply,
    @Headers('accept') acceptHeader: string,
  ) {
    const file: Stream = await this.loadCPFile(
      CloudProvidersMetaData.AWS,
      path,
    );
    const type = this.getContentType(contentType, acceptHeader);
    res.type(type);

    return file;
  }

  @Get('/azure')
  @ApiQuery({
    name: 'path',
    example: 'config/products/crystals/amethyst.jpg',
    required: true,
  })
  @ApiQuery({ name: 'type', example: 'image/jpg', required: true })
  @ApiHeader({ name: 'accept', example: 'image/jpg', required: true })
  @ApiOkResponse({
    description: 'File read successfully',
  })
  @ApiInternalServerErrorResponse({
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
  })
  @ApiOperation({
    description: SWAGGER_DESC_READ_FILE,
  })
  async loadAzureFile(
    @Query('path') path: string,
    @Query('type') contentType: string,
    @Res({ passthrough: true }) res: FastifyReply,
    @Headers('accept') acceptHeader: string,
  ) {
    const file: Stream = await this.loadCPFile(
      CloudProvidersMetaData.AZURE,
      path,
    );
    const type = this.getContentType(contentType, acceptHeader);
    res.type(type);

    return file;
  }

  @Get('/digital_ocean')
  @ApiQuery({
    name: 'path',
    example: 'config/products/crystals/amethyst.jpg',
    required: true,
  })
  @ApiQuery({ name: 'type', example: 'image/jpg', required: true })
  @ApiHeader({ name: 'accept', example: 'image/jpg', required: true })
  @ApiOkResponse({
    description: 'File read successfully',
  })
  @ApiInternalServerErrorResponse({
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
  })
  @ApiOperation({
    description: SWAGGER_DESC_READ_FILE,
  })
  async loadDigitalOceanFile(
    @Query('path') path: string,
    @Query('type') contentType: string,
    @Res({ passthrough: true }) res: FastifyReply,
    @Headers('accept') acceptHeader: string,
  ) {
    const file: Stream = await this.loadCPFile(
      CloudProvidersMetaData.DIGITAL_OCEAN,
      path,
    );
    const type = this.getContentType(contentType, acceptHeader);
    res.type(type);

    return file;
  }

  @Delete()
  @ApiQuery({
    name: 'path',
    example: 'config/products/crystals/some_file.jpg',
    required: true,
  })
  @ApiOperation({
    description: SWAGGER_DESC_DELETE_FILE,
  })
  @ApiInternalServerErrorResponse({
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({
    description: 'File deleted successfully',
  })
  async deleteFile(@Query('path') path: string): Promise<void> {
    await this.fileService.deleteFile(path);
  }

  @Put('raw')
  @ApiQuery({
    name: 'path',
    example: 'some/path/to/file.png',
    required: true,
  })
  @ApiOperation({
    description: SWAGGER_DESC_SAVE_RAW_CONTENT,
  })
  @ApiOkResponse()
  async uploadFile(
    @Query('path') file: string,
    @Body() raw: string,
  ): Promise<string> {
    try {
      if (typeof raw === 'string' || Buffer.isBuffer(raw)) {
        await fs.promises.access(path.dirname(file), W_OK);
        await fs.promises.writeFile(file, raw);
        return `File uploaded successfully at ${file}`;
      }
    } catch (err) {
      this.logger.error(err.message);
      throw err.message;
    }
  }

  @Get('raw')
  @ApiQuery({
    name: 'path',
    example: 'config/products/crystals/amethyst.jpg',
    required: true,
  })
  @ApiOperation({
    description: SWAGGER_DESC_READ_FILE_ON_SERVER,
  })
  @ApiNotFoundResponse({
    description: 'File not found',
  })
  @ApiOkResponse({
    description: 'Returns requested file',
  })
  async readFile(
    @Query('path') file: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    try {
      const stream = await this.fileService.getFile(file);
      res.type('application/octet-stream');

      return stream;
    } catch (err) {
      this.logger.error(err.message);
      res.status(HttpStatus.NOT_FOUND);
    }
  }
}
