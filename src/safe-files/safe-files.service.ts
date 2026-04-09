import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';

export interface SafeFileResponse {
  name: string;
  url: string;
  content: string;
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_HOSTS = new Set([
  // Add trusted external sources here.
  // Example: 'example.com', 'files.example.com'
]);

@Injectable()
export class SafeFilesService {
  async add(name: string, url: string): Promise<SafeFileResponse> {
    const safeUrl = this.validateAndNormalizeUrl(url);
    const content = await this.fetchContent(safeUrl);
    return { name, url: safeUrl.toString(), content };
  }

  private validateAndNormalizeUrl(url: string): URL {
    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid url');
    }

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      throw new BadRequestException('Invalid url scheme');
    }

    if (ALLOWED_HOSTS.size > 0 && !ALLOWED_HOSTS.has(parsed.hostname)) {
      throw new BadRequestException('Untrusted host');
    }

    return parsed;
  }

  private async fetchContent(url: URL): Promise<string> {
    try {
      const response = await axios.get(url.toString(), {
        responseType: 'text',
        maxRedirects: 0,
        timeout: 5000,
        validateStatus: (status) => status >= 200 && status < 300
      });
      return typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);
    } catch {
      return '';
    }
  }
}
