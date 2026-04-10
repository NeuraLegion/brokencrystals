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
  private readonly baseDir = process.cwd();

  private resolveSafeLocalPath(file: string): string {
    if (!file || typeof file !== 'string') {
      throw new BadRequestException('Invalid file path');
    }

    if (
      file.includes('://') ||
      file.startsWith('\\\\') ||
      file.startsWith('//') ||
      file.startsWith('http:') ||
      file.startsWith('https:') ||
      file.startsWith('file:')
    ) {
      throw new BadRequestException('Remote or URL-based paths are not allowed');
    }

    const resolvedPath = path.resolve(this.baseDir, file);
    const baseDirWithSep = this.baseDir.endsWith(path.sep)
      ? this.baseDir
      : `${this.baseDir}${path.sep}`;

    if (resolvedPath !== this.baseDir && !resolvedPath.startsWith(baseDirWithSep)) {
      throw new BadRequestException('Path traversal is not allowed');
    }

    return resolvedPath;
  }

  async getFile(file: string): Promise<Readable> {
    this.logger.log(`Reading file: ${file}`);

    const resolvedPath = this.resolveSafeLocalPath(file);

    await fs.promises.access(resolvedPath, R_OK);

    return fs.createReadStream(resolvedPath);
  }

  async deleteFile(file: string): Promise<boolean> {
    const resolvedPath = this.resolveSafeLocalPath(file);
    await fs.promises.unlink(resolvedPath);
    return true;
  }
}
