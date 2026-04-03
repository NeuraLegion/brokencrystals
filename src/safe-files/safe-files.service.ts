import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as xml2js from 'xml2js';

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
      const parser = new xml2js.Parser({
        explicitArray: false,
        disableEntities: true // Disable external entities to prevent XXE
      });
      const result = await parser.parseStringPromise(response.data);
      return JSON.stringify(result);
    } catch {
      return '';
    }
  }
}