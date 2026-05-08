import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';
import { encode, decode } from 'jwt-simple';

export class JwtTokenWithHMACKeysProcessor extends JwtTokenProcessor {
  constructor(private privateKey: string) {
    super(new Logger(JwtTokenWithHMACKeysProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    if (typeof token !== 'string' || !token.trim()) {
      throw new UnauthorizedException('Unauthorized');
    }

    try {
      const [header, payload] = this.parse(token);
      if (header.alg === 'none') {
        return payload;
      }
      return decode(token, this.privateKey, false, 'HS256');
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');

    const token = encode(payload, this.privateKey, 'HS256');
    return token;
  }
}
