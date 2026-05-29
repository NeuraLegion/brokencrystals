import {
  BadRequestException,
  Body,
  Controller,
  Post
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExcludeController,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from '@nestjs/swagger';
import { SafeFilesService, SafeFileResponse } from './safe-files.service';

@Controller('/api/safe-files')
@ApiTags('Safe files controller')
@ApiExcludeController()
export class SafeFilesController {
  constructor(private readonly service: SafeFilesService) {}
  @Post()
  @ApiOperation({ description: 'Store a new file URL if its host is allowed' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            url: { type: 'string' }
          }
        },
        content: { type: 'string' }
      }
    }
  })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  create(
    @Body('name') name: string,
    @Body('url') url: string
  ): Promise<SafeFileResponse> {
    if (typeof name !== 'string' || !name.trim()) {
      throw new BadRequestException('Invalid input');
    }

    if (typeof url !== 'string' || !this.service.isAllowedUrl(url)) {
      throw new BadRequestException('Invalid input');
    }

    return this.service.add(name.trim(), url);
  }
}
