import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import * as net from 'node:net';
import { lookup } from 'node:dns/promises';

export interface SafeFileResponse {
  name: string;
  url: string;
  content: string;
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

// Explicit allowlist only: add trusted hosts here.
// If this set is empty, all fetches are rejected.
const ALLOWED_HOSTS = new Set<string>([
  // 'example.com',
  // 'files.example.com'
]);

const BLOCKED_HOSTS = new Set<string>([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254'
]);

@Injectable()
export class SafeFilesService {
  async add(name: string, url: string): Promise<SafeFileResponse> {
    const safeUrl = await this.validateAndNormalizeUrl(url);
    const content = await this.fetchContent(safeUrl);
    return { name, url: safeUrl.toString(), content };
  }

  private normalizeHostname(hostname: string): string {
    return hostname.toLowerCase().replace(/\.$/, '');
  }

  private isBlockedHost(hostname: string): boolean {
    const normalized = this.normalizeHostname(hostname);
    if (BLOCKED_HOSTS.has(normalized)) {
      return true;
    }

    if (net.isIP(normalized) === 4) {
      const parts = normalized.split('.').map((part) => Number(part));
      const [a, b] = parts;
      if (
        a === 10 ||
        a === 127 ||
        a === 0 ||
        (a === 169 && b === 254) ||
        (a === 192 && b === 168) ||
        (a === 172 && b >= 16 && b <= 31)
      ) {
        return true;
      }
    }

    if (net.isIP(normalized) === 6) {
      return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd');
    }

    return false;
  }

  private async validateAndNormalizeUrl(url: string): Promise<URL> {
    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid url');
    }

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      throw new BadRequestException('Invalid url scheme');
    }

    if (!parsed.hostname || parsed.username || parsed.password) {
      throw new BadRequestException('Invalid url');
    }

    const hostname = this.normalizeHostname(parsed.hostname);

    if (this.isBlockedHost(hostname)) {
      throw new BadRequestException('Untrusted host');
    }

    if (ALLOWED_HOSTS.size === 0 || !ALLOWED_HOSTS.has(hostname)) {
      throw new BadRequestException('Untrusted host');
    }

    // Resolve DNS and block hosts that resolve to private/internal addresses.
    const resolved = await lookup(hostname, { all: true, verbatim: true });
    for (const record of resolved) {
      if (this.isBlockedHost(record.address)) {
        throw new BadRequestException('Untrusted host');
      }
    }

    parsed.hostname = hostname;
    return parsed;
  }

  private async fetchContent(url: URL): Promise<string> {
    try {
      const response = await axios.get(url.toString(), {
        responseType: 'text',
        maxRedirects: 0,
        timeout: 5000,
        validateStatus: (status) => status >= 200 && status < 300,
        // Prevent axios from using any ambient proxy settings that could bypass host controls.
        proxy: false
      });
      return typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);
    } catch {
      return '';
    }
  }
}
