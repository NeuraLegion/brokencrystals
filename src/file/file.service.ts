import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { CloudProvidersMetaData } from './cloud.providers.metadata';
import { R_OK } from 'constants';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private cloudProviders = new CloudProvidersMetaData();
  private readonly localFileBaseDir = path.resolve(process.cwd(), 'files');

  private normalizeLocalFilePath(file: string): string {
    const normalized = file?.trim();

    if (!normalized) {
      throw new BadRequestException('Invalid file path');
    }

    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      throw new BadRequestException('Invalid file path');
    }

    if (path.isAbsolute(normalized)) {
      throw new BadRequestException('Invalid file path');
    }

    if (normalized.includes('..') || normalized.includes('\\')) {
      throw new BadRequestException('Invalid file path');
    }

    const resolvedPath = path.resolve(this.localFileBaseDir, normalized);
    const baseDirWithSep = this.localFileBaseDir.endsWith(path.sep)
      ? this.localFileBaseDir
      : `${this.localFileBaseDir}${path.sep}`;

    if (resolvedPath !== this.localFileBaseDir && !resolvedPath.startsWith(baseDirWithSep)) {
      throw new BadRequestException('Invalid file path');
    }

    return resolvedPath;
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
    }

    const safeFilePath = this.normalizeLocalFilePath(file);
    await fs.promises.access(safeFilePath, R_OK);

    return fs.createReadStream(safeFilePath);
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
