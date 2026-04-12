import { Logger } from '@nestjs/common';
import { JwtHeader } from './jwt.header';

export abstract class JwtTokenProcessor {
  private static readonly END_CERTIFICATE_MARK = '-----END CERTIFICATE-----';
  private static readonly END_PUBLIC_KEY_MARK = '-----END PUBLIC KEY-----';
  protected log: Logger = new Logger(JwtTokenProcessor.name);

  constructor(log: Logger) {
    this.log = log;
  }

  protected parse(token: string): [header: JwtHeader, payload: unknown] {
    this.log.debug('Call parse');

    const parts = token.split('.');
    if (parts.length != 3 || !parts[0]) {
      throw new Error('Failed to parse jwt token header');
    }

    const headerStr = this.decodeBase64Url(parts[0]);
    this.log.debug(`Jwt token header is ${headerStr}`);
    const header: JwtHeader = JSON.parse(headerStr);

    if (!header?.alg || !this.isAllowedAlgorithm(header.alg)) {
      throw new Error('Invalid JWT algorithm');
    }

    const payloadStr = this.decodeBase64Url(parts[1]);
    const payload = JSON.parse(payloadStr);

    return [header, payload];
  }

  private isAllowedAlgorithm(alg: string): boolean {
    return alg === 'HS256' || alg === 'RS256';
  }

  private decodeBase64Url(value: string): string {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return Buffer.from(padded, 'base64').toString('utf8');
  }

  protected parseCRTChain(chainText: string): string {
    this.log.debug('Call parseCRTChain');

    let idx = -1;
    if (
      !chainText ||
      (idx = Math.max(
        chainText.indexOf(JwtTokenProcessor.END_CERTIFICATE_MARK),
        chainText.indexOf(JwtTokenProcessor.END_PUBLIC_KEY_MARK)
      )) === -1
    ) {
      throw new Error('Invalid certificate');
    }

    const key = chainText.slice(
      0,
      idx + JwtTokenProcessor.END_CERTIFICATE_MARK.length
    );
    this.log.debug(`Extracted key\n${key}`);
    return key;
  }

  abstract validateToken(token: string): Promise<unknown>;

  abstract createToken(payload: unknown): Promise<string>;
}
