import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import * as dns from 'dns';
import * as net from 'net';

export interface SafeFileResponse {
  name: string;
  url: string;
  content: string;
}

// Explicit allowlist of hosts that are permitted as remote file sources.
// Add trusted hostnames here as needed - nothing else is allowed.
const ALLOWED_HOSTS: string[] = ['filedealer.nexploit.app'];

@Injectable()
export class SafeFilesService {
  async add(name: string, url: string): Promise<SafeFileResponse> {
    await this.assertUrlIsSafe(url);
    const content = await this.fetchContent(url);
    return { name, url, content };
  }

  private async assertUrlIsSafe(url: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    if (parsed.protocol !== 'https:') {
      throw new BadRequestException('Untrusted host');
    }

    const hostname = parsed.hostname.toLowerCase();

    if (!ALLOWED_HOSTS.includes(hostname)) {
      throw new BadRequestException('Untrusted host');
    }

    if (this.isDisallowedIp(hostname)) {
      throw new BadRequestException('Untrusted host');
    }

    let addresses: string[];
    try {
      const lookups = await dns.promises.lookup(hostname, { all: true });
      addresses = lookups.map((entry) => entry.address);
    } catch {
      throw new BadRequestException('Untrusted host');
    }

    if (addresses.length === 0 || addresses.some((ip) => this.isDisallowedIp(ip))) {
      throw new BadRequestException('Untrusted host');
    }
  }

  private isDisallowedIp(ip: string): boolean {
    if (!net.isIP(ip)) {
      return false;
    }

    if (net.isIPv4(ip)) {
      const parts = ip.split('.').map(Number);
      const [a, b] = parts;

      if (a === 127) return true; // loopback
      if (a === 10) return true; // private
      if (a === 172 && b >= 16 && b <= 31) return true; // private
      if (a === 192 && b === 168) return true; // private
      if (a === 169 && b === 254) return true; // link-local / cloud metadata
      if (a === 0) return true; // "this" network
      if (a === 100 && b >= 64 && b <= 127) return true; // shared address space
    }

    if (net.isIPv6(ip)) {
      const normalized = ip.toLowerCase();
      if (normalized === '::1') return true; // loopback
      if (normalized.startsWith('fe80:')) return true; // link-local
      if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local
      if (normalized.startsWith('::ffff:127.')) return true;
    }

    return false;
  }

  private async fetchContent(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        responseType: 'text',
        maxRedirects: 0
      });
      return typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);
    } catch {
      return '';
    }
  }
}
