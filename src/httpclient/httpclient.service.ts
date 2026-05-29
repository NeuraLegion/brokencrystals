import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';

@Injectable()
export class HttpClientService {
  private readonly log: Logger = new Logger(HttpClientService.name);

  private validateUrl(url: string): URL {
    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid remote URL');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Invalid remote URL');
    }

    const hostname = parsed.hostname.toLowerCase();
    const blockedHosts = new Set([
      'localhost',
      '127.0.0.1',
      '::1',
      '169.254.169.254'
    ]);

    if (blockedHosts.has(hostname)) {
      throw new Error('Invalid remote URL');
    }

    return parsed;
  }

  async loadJSON<T = unknown>(url: string): Promise<T> {
    const safeUrl = this.validateUrl(url).toString();
    const resp = await axios.get<T>(safeUrl, {
      responseType: 'json'
    });
    if (resp.status != 200) {
      throw new Error('Failed to load remote resource');
    }
    this.log.debug(
      `Loaded: ${
        typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
      }`
    );
    return resp.data;
  }

  async post<T = unknown>(
    url: string,
    data: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const safeUrl = this.validateUrl(url).toString();
    const resp = await axios.post<T>(safeUrl, data, config);
    if (![200, 201].includes(+resp.status)) {
      throw new Error(`Failed to load url: ${safeUrl}. Status ${resp.status}`);
    }
    this.log.debug(`Loaded: ${resp.data}`);
    return resp.data;
  }

  async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const safeUrl = this.validateUrl(url).toString();
    const resp = await axios.get(safeUrl, config);
    if (![200, 201].includes(+resp.status)) {
      throw new Error('Failed to load remote resource');
    }
    this.log.debug(`Loaded: ${resp.data}`);
    return resp.data;
  }

  async loadPlain(url: string): Promise<string> {
    try {
      const safeUrl = this.validateUrl(url).toString();
      const resp = await axios.get<ArrayBuffer>(safeUrl, {
        responseType: 'arraybuffer'
      });

      if (resp.status != 200) {
        throw new Error('Failed to load remote resource');
      }

      const buffer = Buffer.from(resp.data);
      const text = buffer.toString();
      this.log.debug('Loaded plain remote resource');
      return text;
    } catch {
      throw new Error('Failed to load remote resource');
    }
  }

  async loadAny(url: string): Promise<{
    content: Buffer;
    contentType: string;
  }> {
    const safeUrl = this.validateUrl(url).toString();
    const resp = await axios.get<ArrayBuffer>(safeUrl, {
      responseType: 'arraybuffer'
    });

    if (resp.status != 200) {
      throw new Error('Failed to load remote resource');
    }

    const buffer = Buffer.from(resp.data);

    return {
      content: buffer,
      contentType: resp.headers['content-type']
    };
  }
}
