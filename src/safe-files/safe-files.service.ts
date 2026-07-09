import { Injectable } from '@nestjs/common';
import axios from 'axios';

export interface SafeFileResponse {
  name: string;
  url: string;
  content: string;
}

@Injectable()
export class SafeFilesService {
  async add(name: string, url: string): Promise<SafeFileResponse> {
    const content = await this.fetchContent(url);
    return { name, url, content };
  }

  private async fetchContent(url: string): Promise<string> {
    try {
      const response = await axios.get(url, { responseType: 'text' });
      return typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);
    } catch {
      return '';
    }
  }
}
