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
  private readonly allowedLocalBase = path.resolve(
    process.cwd(),
    'config/products'
  );

  private resolveAllowedLocalPath(file: string): string {
    const resolved = file.startsWith('/')
      ? path.resolve(file)
      : path.resolve(process.cwd(), file);
    const relative = path.relative(
      this.allowedLocalBase,
      path.normalize(resolved)
    );
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('access to requested file path is denied');
    }
    return resolved;
  }

  async getFile(file: string): Promise<Readable> {
    this.logger.log(`Reading file: ${file}`);

    if (file.startsWith('http')) {
      const content = await this.cloudProviders.get(file);

      if (content) {
        return Readable.from(content);
      } else {
        throw new Error(`no such file or directory, access '${file}'`);
      }
    } else {
      file = this.resolveAllowedLocalPath(file);

      await fs.promises.access(file, R_OK);

      return fs.createReadStream(file);
    }
  }

  async deleteFile(file: string): Promise<boolean> {
    if (file.startsWith('http')) {
      throw new Error('cannot delete file from this location');
    } else {
      file = this.resolveAllowedLocalPath(file);
      await fs.promises.unlink(file);
      return true;
    }
  }
}
