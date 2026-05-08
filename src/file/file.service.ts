import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { CloudProvidersMetaData } from './cloud.providers.metadata';
import { R_OK } from 'constants';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private cloudProviders = new CloudProvidersMetaData();
  private readonly forbiddenNames = new Set(['.env', '.git', '.npmrc', '.htaccess']);

  private validateFilePath(file: string): string {
    if (!file || typeof file !== 'string') {
      throw new BadRequestException('Invalid file path');
    }

    if (file.startsWith('http')) {
      return file;
    }

    const normalized = file.startsWith('/') ? file : path.resolve(process.cwd(), file);
    const relative = path.relative(process.cwd(), normalized);
    const baseName = path.basename(normalized);

    if (
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      baseName.startsWith('.') ||
      this.forbiddenNames.has(baseName)
    ) {
      throw new BadRequestException('Invalid file path');
    }

    return normalized;
  }

  async getFile(file: string): Promise<Readable> {
    file = this.validateFilePath(file);
    this.logger.log(`Reading file: ${file}`);

    if (file.startsWith('http')) {
      const content = await this.cloudProviders.get(file);

      if (content) {
        return Readable.from(content);
      } else {
        throw new Error(`no such file or directory, access '${file}'`);
      }
    }

    await fs.promises.access(file, R_OK);
    return fs.createReadStream(file);
  }

  async deleteFile(file: string): Promise<boolean> {
    file = this.validateFilePath(file);

    if (file.startsWith('http')) {
      throw new Error('cannot delete file from this location');
    } else {
      await fs.promises.unlink(file);
      return true;
    }
  }
}
