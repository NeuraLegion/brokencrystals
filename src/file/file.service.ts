import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { R_OK } from 'constants';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  async getFile(file: string): Promise<Readable> {
    this.logger.log(`Reading file: ${file}`);

    // This service must never be used to reach remote/http(s) resources
    // (including cloud metadata endpoints such as 169.254.169.254 or
    // metadata.google.internal). Only local, on-disk file paths are
    // supported here to eliminate any SSRF surface.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(file) || file.startsWith('http')) {
      throw new Error(
        `Requests to arbitrary URLs are not permitted: '${file}'`
      );
    }

    if (file.startsWith('/')) {
      await fs.promises.access(file, R_OK);

      return fs.createReadStream(file);
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
