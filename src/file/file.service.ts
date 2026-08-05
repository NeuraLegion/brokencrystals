import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { CloudProvidersMetaData } from './cloud.providers.metadata';
import { R_OK } from 'constants';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly allowedFileBaseDir = path.resolve(process.cwd(), 'config');
  private cloudProviders = new CloudProvidersMetaData();

  async getFile(file: string): Promise<Readable> {
    this.logger.log(`Reading file: ${file}`);

    if (typeof file !== 'string' || file.trim().length === 0) {
      throw new NotFoundException('File not found');
    }

    const normalizedFile = file.trim().replace(/\\/g, '/');

    if (
      normalizedFile.startsWith('/') ||
      normalizedFile.includes('..') ||
      normalizedFile.includes('://') ||
      normalizedFile.includes('?') ||
      normalizedFile.includes('#')
    ) {
      throw new NotFoundException('File not found');
    }

    const resolvedFile = path.resolve(this.allowedFileBaseDir, normalizedFile);

    if (
      resolvedFile !== this.allowedFileBaseDir &&
      !resolvedFile.startsWith(`${this.allowedFileBaseDir}${path.sep}`)
    ) {
      throw new NotFoundException('File not found');
    }

    try {
      await fs.promises.access(resolvedFile, R_OK);
    } catch {
      throw new NotFoundException('File not found');
    }

    return fs.createReadStream(resolvedFile);
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
