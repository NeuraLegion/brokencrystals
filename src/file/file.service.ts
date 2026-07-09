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

  // Only these exact, hardcoded cloud metadata base URLs may ever be
  // forwarded to the CloudProvidersMetaData helper. Any other value
  // (including attacker-supplied URLs) is rejected before it can reach
  // the outbound HTTP call, preventing SSRF.
  private static readonly ALLOWED_CLOUD_PROVIDER_URLS: ReadonlySet<string> =
    new Set([
      CloudProvidersMetaData.GOOGLE,
      CloudProvidersMetaData.AZURE,
      CloudProvidersMetaData.AWS,
      CloudProvidersMetaData.DIGITAL_OCEAN,
      CloudProvidersMetaData.DIGITAL_OCEAN_JSON
    ]);

  async getFile(file: string): Promise<Readable> {
    this.logger.log(`Reading file: ${file}`);

    if (file.startsWith('/')) {
      await fs.promises.access(file, R_OK);

      return fs.createReadStream(file);
    } else if (file.startsWith('http')) {
      if (!FileService.ALLOWED_CLOUD_PROVIDER_URLS.has(file)) {
        throw new Error(
          `Requests to arbitrary URLs are not permitted: '${file}'`
        );
      }

      const content = await this.cloudProviders.get(file);

      if (content) {
        return Readable.from(content);
      } else {
        throw new Error(`no such file or directory, access '${file}'`);
      }
    } else {
      file = path.resolve(process.cwd(), file);

      await fs.promises.access(file, R_OK);

      return fs.createReadStream(file);
    }
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
