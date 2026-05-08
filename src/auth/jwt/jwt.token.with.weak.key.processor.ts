import { Logger, UnauthorizedException } from '@nestjs/common';
import { decode, encode } from 'jwt-simple';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithWeakKeyProcessor extends JwtTokenProcessor {
  constructor(private key: string) {
    super(new Logger(JwtTokenWithWeakKeyProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    if (typeof token !== 'string' || token.length > 4096) {
      this.log.warn('Weak-key JWT validation failed');
      throw new UnauthorizedException({ error: 'Unauthorized' });
    }

    const jwtParts = token.split('.');
    if (jwtParts.length !== 3 || jwtParts.some((part) => !part.length)) {
      this.log.warn('Weak-key JWT validation failed');
      throw new UnauthorizedException({ error: 'Unauthorized' });
    }

    try {
      return decode(token, this.key, false);
    } catch {
      this.log.warn('Weak-key JWT validation failed');
      throw new UnauthorizedException({ error: 'Unauthorized' });
    }
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');
    return encode(payload, this.key, 'HS256');
  }
}
