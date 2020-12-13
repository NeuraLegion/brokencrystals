import { Logger } from '@nestjs/common';
import { JwtHeader } from './jwt.header';

export abstract class JwtTokenProcessor {
  protected log: Logger = new Logger(JwtTokenProcessor.name);

  constructor(log: Logger) {
    this.log = log;
  }

  protected parse(token: string): [header: JwtHeader, payload: object] {
    this.log.debug('Call parse');

    const parts = token.split('.');
    if (parts.length != 3 || !parts[0]) {
      throw new Error('Failed to parse jwt token header');
    }
    const headerStr = Buffer.from(parts[0], 'base64').toString('ascii');
    this.log.debug(`Jwt token header is ${headerStr}`);
    const header: JwtHeader = JSON.parse(headerStr);

    const payloadStr = Buffer.from(parts[1], 'base64').toString('ascii');
    this.log.debug(`Jwt token (None alg) payload is ${payloadStr}`);
    const payload: any = JSON.parse(payloadStr);

    return [header, payload];
  }

  abstract validateToken(token: string): Promise<any>;

  abstract createToken(payload: unknown): Promise<string>;
}
