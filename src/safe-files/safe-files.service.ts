import { Injectable } from '@nestjs/common';
import axios from 'axios';

export interface SafeFileResponse {
  name: string;
  url: string;
  content: string;
}

const ALLOWED_SAFE_FILE_HOSTS = new Set([
  'example.com',
  'www.example.com'
]);

const ALLOWED_SAFE_FILE_PATHS = new Set([
  '/',
  '/safe-files',
  '/safe-files/'
]);

@Injectable()
export class SafeFilesService {
  async add(name: string, url: string): Promise<SafeFileResponse> {
    const normalizedUrl = this.validateSafeUrl(url);
    const content = await this.fetchContent(normalizedUrl);
    return { name, url, content };
  }

  private validateSafeUrl(url: string): string {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error('Invalid URL');
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Untrusted host');
    }

    if (!ALLOWED_SAFE_FILE_HOSTS.has(parsedUrl.hostname)) {
      throw new Error('Untrusted host');
    }

    if (!ALLOWED_SAFE_FILE_PATHS.has(parsedUrl.pathname)) {
      throw new Error('Untrusted host');
    }

    if (parsedUrl.search || parsedUrl.hash || parsedUrl.username || parsedUrl.password) {
      throw new Error('Untrusted host');
    }

    return parsedUrl.toString();
  }

  private async fetchContent(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
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
