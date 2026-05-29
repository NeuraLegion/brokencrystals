import { BadGatewayException, Injectable } from '@nestjs/common';

export interface SafeFileResponse {
  name: string;
  url: string;
  content: string;
}

@Injectable()
export class SafeFilesService {
  private readonly allowedHosts = new Set<string>(['example.com', 'www.example.com']);

  isAllowedUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        this.allowedHosts.has(parsed.hostname.toLowerCase())
      );
    } catch {
      return false;
    }
  }

  async add(name: string, url: string): Promise<SafeFileResponse> {
    if (!this.isAllowedUrl(url)) {
      throw new BadGatewayException('Unable to retrieve content');
    }

    return { name, url, content: '' };
  }
}
