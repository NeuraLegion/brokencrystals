import { Injectable, Logger } from '@nestjs/common';
import * as axios from 'axios';

@Injectable()
export class HttpClientService {
  private readonly log: Logger = new Logger(HttpClientService.name);

  async loadJSON(url: string): Promise<unknown> {
    const resp = await axios.default.get<unknown>(url, {
      responseType: 'json',
    });
    if (resp.status != 200) {
      throw new Error(`Failed to load url: ${url}. Status ${resp.status}`);
    }
    this.log.debug(`Loaded: ${resp.data}`);
    return resp.data;
  }

  async loadPlain(url: string): Promise<string> {
    const resp = await axios.default.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
    });

    if (resp.status != 200) {
      throw new Error(`Failed to load url: ${url}. Status ${resp.status}`);
    }

    const buffer = Buffer.from(resp.data);
    const textdata = buffer.toString();
    this.log.debug(`Loaded: ${textdata}`);
    return textdata;
  }

  async loadAny(url: string): Promise<{
    content: Buffer,
    contentType: string
  }> {
    const resp = await axios.default.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
    });

    if (resp.status != 200) {
      throw new Error(`Failed to load url: ${url}. Status ${resp.status}`);
    }

    const buffer = Buffer.from(resp.data);

    return {
      content: buffer,
      contentType: resp.headers['Content-Type']
    };
  }
}
