import { BadRequestException, Injectable } from '@nestjs/common';

export interface SafeFileResponse {
  name: string;
  url: string;
  content: string;
}

@Injectable()
export class SafeFilesService {
  private readonly allowedFiles = new Map<string, string>([
    ['https://example.com/', 'Example Domain'],
    ['https://www.example.com/', 'Example Domain']
  ]);

  async add(name: string, url: string): Promise<SafeFileResponse> {
    const validatedUrl = this.validateUrl(url);
    const content = this.fetchContent(validatedUrl);
    return { name, url: validatedUrl, content };
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

    if (parsedUrl.search || parsedUrl.hash) {
      throw new BadRequestException('URL must not include query strings or fragments');
    }

    const normalizedUrl = parsedUrl.toString();

    if (!this.allowedFiles.has(normalizedUrl)) {
      throw new BadRequestException('Untrusted file');
    }

    return normalizedUrl;
  }

  private fetchContent(url: string): string {
    return this.allowedFiles.get(url) ?? '';
  }
}
