import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExcludeController,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from '@nestjs/swagger';
import { SafeFilesService, SafeFileResponse } from './safe-files.service';

class CreateSafeFileDto {
  name: string;
  url: string;
}

function validateCreateSafeFileDto(body: unknown): CreateSafeFileDto {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('Invalid request body');
  }

  const { name, url } = body as Record<string, unknown>;

  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new BadRequestException('Invalid name');
  }

  if (typeof url !== 'string' || url.trim().length === 0) {
    throw new BadRequestException('Invalid url');
  }

  return { name, url };
}

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
  @ApiBadRequestResponse({ description: 'Untrusted host' })
  create(@Body() body: unknown): Promise<SafeFileResponse> {
    const dto = validateCreateSafeFileDto(body);
    return this.service.add(dto.name, dto.url);
  }
}
