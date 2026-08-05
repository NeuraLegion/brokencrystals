import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';

export interface SafeFileResponse {
  name: string;
  url: string;
  content: string;
}

@Injectable()
export class SafeFilesService {
  private readonly allowedHosts = new Set(['example.com', 'www.example.com']);

  async add(name: string, url: string): Promise<SafeFileResponse> {
    const content = await this.fetchContent(url);
    return { name, url, content };
  }

  private validateUrl(url: string): string {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new BadRequestException('Unsupported URL protocol');
    }

    if (parsedUrl.username || parsedUrl.password) {
      throw new BadRequestException('URL credentials are not allowed');
    }

    if (!this.allowedHosts.has(parsedUrl.hostname)) {
      throw new BadRequestException('Untrusted host');
    }

    return parsedUrl.toString();
  }

  private async fetchContent(url: string): Promise<string> {
    const validatedUrl = this.validateUrl(url);

    try {
      const response = await axios.get(validatedUrl, {
        responseType: 'text',
        maxRedirects: 0,
        timeout: 5000,
        validateStatus: (status) => status >= 200 && status < 400
      });
      return typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);
    } catch {
      return '';
    }
  }
}
