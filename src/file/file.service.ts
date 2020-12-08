import { Injectable, Logger } from '@nestjs/common';
import { Stream } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { CloudProvidersMetaData } from './cloud.providers.metadata';

@Injectable()
export class FileService {
  private log: Logger = new Logger(FileService.name);
  private cloudProviders = new CloudProvidersMetaData();

  async getFile(file: string): Promise<Stream> {
    this.log.debug(`getFile ${file}`);

    if (file.startsWith('/')) {
      return fs.createReadStream(file);
    } else if (file.startsWith('http')) {
      return fs.createReadStream(this.cloudProviders.get(file));
    } else {
      file = path.resolve(process.cwd(), file);
      return fs.createReadStream(file);
    }
  }
}
