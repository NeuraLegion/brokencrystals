import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';

export interface SafeFileResponse {
  name: string;
  url: string;
  content: string;
}

@Injectable()
export class SafeFilesService {
  private static readonly ALLOWED_HOSTS = new Set(['example.com', 'www.example.com']);

  async add(name: string, url: string): Promise<SafeFileResponse> {
    const parsedUrl = this.validateAllowedUrl(url);
    const content = await this.fetchContent(parsedUrl);
    return { name, url: parsedUrl.toString(), content };
  }

  private validateAllowedUrl(url: string): URL {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new BadRequestException('Only HTTPS URLs are allowed');
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (!SafeFilesService.ALLOWED_HOSTS.has(hostname)) {
      throw new BadRequestException('Untrusted host');
    }

    if (parsedUrl.username || parsedUrl.password) {
      throw new BadRequestException('URL credentials are not allowed');
    }

    return parsedUrl;
  }

  private async fetchContent(url: URL): Promise<string> {
    try {
      const response = await axios.get(url.toString(), {
        responseType: 'text',
        maxRedirects: 0,
        timeout: 5000,
        validateStatus: status => status >= 200 && status < 300
      });

      return typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);
    } catch {
      return '';
    }
  }
}
