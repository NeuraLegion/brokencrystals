import { Logger } from '@nestjs/common';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';
import { encode, decode } from 'jwt-simple';

export class JwtTokenWithHMACKeysProcessor extends JwtTokenProcessor {
  constructor(private privateKey: string) {
    super(new Logger(JwtTokenWithHMACKeysProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    try {
      const [header, payload] = this.parse(token);
      if (header.alg === 'none') {
        return payload;
      }

      return decode(token, this.privateKey, false, 'HS256');
    } catch (err) {
      this.log.warn(`Failed to validate HMAC JWT: ${err instanceof Error ? err.message : 'unknown error'}`);
      throw err;
    }
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');

    const token = encode(payload, this.privateKey, 'HS256');
    return token;
  }
}
