import {
  BadRequestException,
  Controller,
  Logger,
  Post,
  Req
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { FastifyRequest } from 'fastify';

const ALLOWED_MIMES = new Set([
  'image/svg+xml',
  'image/svg',
  'image/png',
  'image/jpeg',
  'image/jpg'
]);

const ALLOWED_EXTS = new Set(['.svg', '.png', '.jpg', '.jpeg']);

@ApiExcludeController()
@Controller('/api/hidden-upload')
export class HiddenUploadController {
  private readonly logger = new Logger(HiddenUploadController.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'hidden');

  @Post()
  async uploadImage(@Req() req: FastifyRequest) {
    if (!req.isMultipart()) {
      throw new BadRequestException('Request must be multipart/form-data');
    }

    const file = await req.file();

    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    const normalizedExt = this.normalizeExt(file.mimetype, file.filename);

    if (!normalizedExt) {
      throw new BadRequestException('Only image files are allowed');
    }

    await fsPromises.mkdir(this.uploadDir, { recursive: true });

    const storedName = `${randomUUID()}${normalizedExt}`;
    const destination = path.join(this.uploadDir, storedName);

    this.logger.debug(`Saving hidden upload to ${destination}`);

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    await fsPromises.writeFile(destination, buffer);

    const contentType = this.mapExtToContentType(normalizedExt);

    return {
      content: this.buildDataUrl(normalizedExt, contentType, buffer)
    };
  }

  private normalizeExt(mime: string, name: string): string | undefined {
    if (mime && ALLOWED_MIMES.has(mime)) {
      if (mime.includes('png')) return '.png';
      if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
      if (mime.includes('svg')) return '.svg';
    }

    const ext = path.extname(name || '').toLowerCase();
    if (ALLOWED_EXTS.has(ext)) {
      return ext === '.jpeg' ? '.jpg' : ext;
    }

    return undefined;
  }

  private mapExtToContentType(ext: string): string {
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg') return 'image/jpeg';
    return 'image/svg+xml';
  }

  private buildDataUrl(
    ext: string,
    contentType: string,
    buffer: Buffer
  ): string {
    if (ext === '.svg') {
      const text = buffer.toString('utf8');
      return `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
    }

    return `data:${contentType};base64,${buffer.toString('base64')}`;
  }
}
