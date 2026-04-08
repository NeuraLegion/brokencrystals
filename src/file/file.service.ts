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
  private readonly safeBaseDir = path.resolve(process.cwd());

  private resolveSafePath(file: string): string {
    if (!file || typeof file !== 'string') {
      throw new Error('invalid file path');
    }

    if (file.includes('://') || file.startsWith('http')) {
      throw new Error('remote file access is not allowed');
    }

    const normalizedInput = file.replace(/\\/g, '/');
    const resolved = path.resolve(this.safeBaseDir, normalizedInput);
    const relative = path.relative(this.safeBaseDir, resolved);

    if (
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      normalizedInput.includes('\0')
    ) {
      throw new Error('invalid file path');
    }

    return resolved;
  }

  async getFile(file: string): Promise<Readable> {
    this.logger.log(`Reading file: ${file}`);

    const safePath = this.resolveSafePath(file);
    await fs.promises.access(safePath, R_OK);

    return fs.createReadStream(safePath);
  }

  async deleteFile(file: string): Promise<boolean> {
    const safePath = this.resolveSafePath(file);
    await fs.promises.unlink(safePath);
    return true;
  }
}
