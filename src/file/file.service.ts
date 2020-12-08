import { Injectable, Logger } from '@nestjs/common';
import { Stream } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { CloudProvidersMetaData } from './cloud.providers.metadata';
import { R_OK } from 'constants';

@Injectable()
export class FileService {
  private log: Logger = new Logger(FileService.name);
  private cloudProviders = new CloudProvidersMetaData();

  async getFile(file: string): Promise<Stream> {
    this.log.debug(`getFile ${file}`);

    if (file.startsWith('/')) {
      fs.accessSync(file, R_OK);
      return fs.createReadStream(file);
    } else if (file.startsWith('http')) {
      return fs.createReadStream(this.cloudProviders.get(file));
    } else {
      file = path.resolve(process.cwd(), file);
      fs.accessSync(file, R_OK);
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
