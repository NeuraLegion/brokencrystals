import { Injectable, Logger } from '@nestjs/common';
import { Stream } from 'stream';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FileService {
  private log: Logger = new Logger(FileService.name);

  async getFile(file: string): Promise<Stream> {
    this.log.debug(`getFile ${file}`);

    if (file.startsWith('/')) {
      // do nothing
    } else if (file.startsWith('http')) {
    } else {
      file = path.resolve(process.cwd(), file);
    }
    this.log.debug(`Reading ${file}`);
    return fs.createReadStream(file);
  }
}
