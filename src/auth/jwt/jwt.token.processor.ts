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
    const headerStr = Buffer.from(parts[0], 'base64').toString('ascii');
    const header: JwtHeader = JSON.parse(headerStr);

    const payloadStr = Buffer.from(parts[1], 'base64').toString('ascii');
    const payload = JSON.parse(payloadStr);

    return [header, payload];
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
    return key;
  }

  abstract validateToken(token: string): Promise<unknown>;

  abstract createToken(payload: unknown): Promise<string>;
}
