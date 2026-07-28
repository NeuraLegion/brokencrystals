import { Injectable, Logger } from '@nestjs/common';
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
      throw new Error('file path is required');
    }

    const normalizedInput = file.trim();

    if (/^[a-z][a-z0-9+.-]*:/i.test(normalizedInput)) {
      throw new Error('remote or non-file URI schemes are not allowed');
    }

    if (normalizedInput.startsWith('//')) {
      throw new Error('network paths are not allowed');
    }

    if (path.isAbsolute(normalizedInput)) {
      throw new Error('absolute file paths are not allowed');
    }

    const normalizedRelativePath = path.posix.normalize(normalizedInput.replace(/\\/g, '/'));

    if (
      normalizedRelativePath === '' ||
      normalizedRelativePath === '.' ||
      normalizedRelativePath.startsWith('..') ||
      normalizedRelativePath.includes('../') ||
      path.posix.isAbsolute(normalizedRelativePath)
    ) {
      throw new Error('file path is outside the allowed directory');
    }

    const allowedPrefix = 'config/products/';
    if (!normalizedRelativePath.startsWith(allowedPrefix)) {
      throw new Error('file path is not in an allowed location');
    }

    const relativeAllowedPath = normalizedRelativePath.slice(allowedPrefix.length);
    if (relativeAllowedPath === '' || relativeAllowedPath.includes('..')) {
      throw new Error('file path is outside the allowed directory');
    }

    const resolvedPath = path.resolve(this.allowedRawFileBasePath, relativeAllowedPath);
    const relativePath = path.relative(this.allowedRawFileBasePath, resolvedPath);

    if (
      relativePath === '' ||
      relativePath === '.' ||
      relativePath.startsWith('..') ||
      path.isAbsolute(relativePath)
    ) {
      throw new Error('file path is outside the allowed directory');
    }

    return resolvedPath;
  }

  async getFile(file: string): Promise<Readable> {
    this.logger.log(`Reading file: ${file}`);

    const resolvedPath = this.resolveAllowedRawFilePath(file);
    await fs.promises.access(resolvedPath, R_OK);

    return fs.createReadStream(resolvedPath);
  }

  async deleteFile(file: string): Promise<boolean> {
    if (file.startsWith('/')) {
      throw new Error('cannot delete file from this location');
    } else if (file.startsWith('http')) {
      throw new Error('cannot delete file from this location');
    } else {
      file = path.resolve(process.cwd(), file);
      await fs.promises.unlink(file);
      return true;
    }
  }
}
