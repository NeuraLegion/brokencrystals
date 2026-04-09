import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosRequestConfig } from 'axios';

@Injectable()
export class HttpClientService {
  private readonly log: Logger = new Logger(HttpClientService.name);

  async loadJSON<T = unknown>(url: string): Promise<T> {
    try {
      const resp = await axios.get<T>(url, {
        responseType: 'json'
      });
      if (resp.status != 200) {
        this.log.warn(`Unexpected status while loading JSON: ${resp.status}`);
        throw new Error('Failed to load JSON');
      }
      this.log.debug(
        `Loaded: ${
          typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
        }`
      );
      return resp.data;
    } catch (err) {
      const status =
        axios.isAxiosError(err) && err.response ? err.response.status : undefined;
      this.log.warn(
        `Failed to load JSON from remote endpoint${
          status ? ` (status: ${status})` : ''
        }`
      );
      throw new Error('Failed to load JSON');
    }
  }

  async post<T = unknown>(
    url: string,
    data: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const resp = await axios.post<T>(url, data, config);
    if (![200, 201].includes(+resp.status)) {
      throw new Error('Failed to load data');
    }
    this.log.debug(`Loaded: ${resp.data}`);
    return resp.data;
  }

  async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const resp = await axios.get(url, config);
    if (![200, 201].includes(+resp.status)) {
      throw new Error('Failed to load data');
    }
    this.log.debug(`Loaded: ${resp.data}`);
    return resp.data;
  }

  async loadPlain(url: string): Promise<string> {
    const resp = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer'
    });

    if (resp.status != 200) {
      throw new Error('Failed to load plain content');
    }

    const buffer = Buffer.from(resp.data);
    const text = buffer.toString();
    this.log.debug(`Loaded: ${text}`);
    return text;
  }

  async loadAny(url: string): Promise<{
    content: Buffer;
    contentType: string;
  }> {
    const resp = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer'
    });

    if (resp.status != 200) {
      throw new Error('Failed to load content');
    }

    const buffer = Buffer.from(resp.data);

    return {
      content: buffer,
      contentType: resp.headers['content-type']
    };
  }
}
