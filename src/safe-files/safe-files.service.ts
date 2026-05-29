import { BadGatewayException, Injectable } from '@nestjs/common';
import axios from 'axios';

export interface SafeFileResponse {
  name: string;
  url: string;
  content: string;
}

@Injectable()
export class SafeFilesService {
  isAllowedUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      const isLocalHost =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.endsWith('.local');

      return (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        !isLocalHost &&
        !hostname.startsWith('10.') &&
        !hostname.startsWith('192.168.') &&
        !/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
      );
    } catch {
      return false;
    }
  }

  async add(name: string, url: string): Promise<SafeFileResponse> {
    const content = await this.fetchContent(url);
    return { name, url, content };
  }

  private async fetchContent(url: string): Promise<string> {
    if (!this.isAllowedUrl(url)) {
      throw new BadGatewayException('Unable to retrieve content');
    }

    try {
      const response = await axios.get(url, { responseType: 'text' });
      return typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);
    } catch {
      throw new BadGatewayException('Unable to retrieve content');
    }
  }
}
