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

  private validateUrl(url: string): URL {
    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    if (parsed.protocol !== 'https:') {
      throw new BadRequestException('Only https URLs are allowed');
    }

    if (!this.allowedHosts.has(parsed.hostname)) {
      throw new BadRequestException('URL host is not allowed');
    }

    return parsed;
  }

  private async fetchContent(url: string): Promise<string> {
    const parsed = this.validateUrl(url);

    try {
      const response = await axios.get(parsed.toString(), { responseType: 'text' });
      return typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);
    } catch {
      return '';
    }
  }
}
