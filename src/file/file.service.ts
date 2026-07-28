import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { CloudProvidersMetaData } from './cloud.providers.metadata';
import { R_OK } from 'constants';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private cloudProviders = new CloudProvidersMetaData();
  private readonly allowedRawFileBasePath = path.resolve(
    process.cwd(),
    'config/products'
  );

  private resolveAllowedRawFilePath(file: string): string {
    if (typeof file !== 'string' || file.trim() === '') {
      throw new BadRequestException('Invalid file path');
    }

    const normalizedInput = file.trim();

    if (/^[a-z][a-z0-9+.-]*:/i.test(normalizedInput)) {
      throw new BadRequestException('Invalid file path');
    }

    if (normalizedInput.startsWith('//')) {
      throw new BadRequestException('Invalid file path');
    }

    if (path.isAbsolute(normalizedInput)) {
      throw new BadRequestException('Invalid file path');
    }

    const normalizedRelativePath = path.posix.normalize(normalizedInput.replace(/\\/g, '/'));

    if (
      normalizedRelativePath === '' ||
      normalizedRelativePath === '.' ||
      normalizedRelativePath.startsWith('..') ||
      normalizedRelativePath.includes('../') ||
      path.posix.isAbsolute(normalizedRelativePath)
    ) {
      throw new BadRequestException('Invalid file path');
    }

    const allowedPrefix = 'config/products/';
    if (!normalizedRelativePath.startsWith(allowedPrefix)) {
      throw new BadRequestException('Invalid file path');
    }

    const relativeAllowedPath = normalizedRelativePath.slice(allowedPrefix.length);
    if (relativeAllowedPath === '' || relativeAllowedPath.includes('..')) {
      throw new BadRequestException('Invalid file path');
    }

    const resolvedPath = path.resolve(this.allowedRawFileBasePath, relativeAllowedPath);
    const relativePath = path.relative(this.allowedRawFileBasePath, resolvedPath);

    if (
      relativePath === '' ||
      relativePath === '.' ||
      relativePath.startsWith('..') ||
      path.isAbsolute(relativePath)
    ) {
      throw new BadRequestException('Invalid file path');
    }

    return resolvedPath;
  }

  async getFile(file: string): Promise<Readable> {
    this.logger.log(`Reading file: ${file}`);

    const resolvedPath = this.resolveAllowedRawFilePath(file);

    try {
      await fs.promises.access(resolvedPath, R_OK);
    } catch {
      throw new NotFoundException('File not found');
    }

    return fs.createReadStream(resolvedPath);
  }

  async deleteFile(file: string): Promise<boolean> {
    const resolvedPath = this.resolveAllowedRawFilePath(file);
    await fs.promises.unlink(resolvedPath);
    return true;
  }
}
