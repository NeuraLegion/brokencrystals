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

  private resolveSafeLocalPath(file: string): string {
    const normalized = path.posix.normalize(file.replace(/\\/g, '/'));

    if (
      normalized.startsWith('../') ||
      normalized.includes('/../') ||
      normalized === '..' ||
      normalized.startsWith('http:') ||
      normalized.startsWith('https:') ||
      normalized.startsWith('//') ||
      path.isAbsolute(normalized)
    ) {
      throw new BadRequestException('Invalid file path');
    }

    return path.resolve(process.cwd(), normalized);
  }

  async getFile(file: string): Promise<Readable> {
    this.logger.log(`Reading file: ${file}`);

    const resolved = this.resolveSafeLocalPath(file);
    await fs.promises.access(resolved, R_OK);

    return fs.createReadStream(resolved);
  }

  async getCloudFile(providerUrl: string, filePath: string): Promise<Readable> {
    if (!providerUrl.startsWith('http://') && !providerUrl.startsWith('https://')) {
      throw new BadRequestException('Invalid cloud provider URL');
    }

    const content = await this.cloudProviders.get(providerUrl, filePath);

    if (content) {
      return Readable.from(content);
    }

    throw new Error(`no such file or directory, access '${filePath}'`);
  }

  async deleteFile(file: string): Promise<boolean> {
    const resolved = this.resolveSafeLocalPath(file);
    await fs.promises.unlink(resolved);
    return true;
  }
}
