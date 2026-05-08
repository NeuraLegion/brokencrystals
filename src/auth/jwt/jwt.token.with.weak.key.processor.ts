import { Logger, UnauthorizedException } from '@nestjs/common';
import { decode, encode } from 'jwt-simple';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithWeakKeyProcessor extends JwtTokenProcessor {
  constructor(private key: string) {
    super(new Logger(JwtTokenWithWeakKeyProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    try {
      return decode(token, this.key, false);
    } catch (error) {
      this.log.warn('Weak-key JWT validation failed');
      this.log.debug(
        `Weak-key JWT validation error: ${error instanceof Error ? error.message : 'unknown error'}`
      );
      throw new UnauthorizedException({ error: 'Unauthorized' });
    }
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');
    return encode(payload, this.key, 'HS256');
  }
}
