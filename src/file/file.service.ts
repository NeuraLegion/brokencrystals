import { Injectable, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { CloudProvidersMetaData } from './cloud.providers.metadata';
import { R_OK } from 'constants';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private cloudProviders = new CloudProvidersMetaData();

  private isValidPath(filePath: string): boolean {
    // Define a whitelist of allowed directories
    const allowedDirectories = [
      path.resolve(process.cwd(), 'config/products/crystals'),
      // Add more allowed directories as needed
    ];

    // Resolve the absolute path
    const resolvedPath = path.resolve(process.cwd(), filePath);

    // Check if the resolved path starts with any of the allowed directories
    return allowedDirectories.some(dir => resolvedPath.startsWith(dir));
  }

  async getFile(file: string): Promise<Readable> {
    this.logger.log(`Reading file: ${file}`);

    if (!this.isValidPath(file)) {
      throw new BadRequestException('Access to the specified file path is not allowed.');
    }

    if (file.startsWith('/')) {
      await fs.promises.access(file, R_OK);

      return fs.createReadStream(file);
    } else if (file.startsWith('http')) {
      throw new BadRequestException('Remote file access is not allowed.');
    } else {
      file = path.resolve(process.cwd(), file);

      await fs.promises.access(file, R_OK);

      return fs.createReadStream(file);
    }
  }

  async deleteFile(file: string): Promise<boolean> {
    try {
      if (file.startsWith('/')) {
        throw new Error('cannot delete file from this location');
      } else if (file.startsWith('http')) {
        throw new Error('cannot delete file from this location');
      } else {
        file = path.resolve(process.cwd(), file);
        await fs.promises.unlink(file);
        return true;
      }
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete the file.');
    }
  }
}