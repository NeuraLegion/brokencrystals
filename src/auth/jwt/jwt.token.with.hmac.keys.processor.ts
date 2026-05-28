import { InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';
import { encode, decode } from 'jwt-simple';

export class JwtTokenWithHMACKeysProcessor extends JwtTokenProcessor {
  constructor(private privateKey: string) {
    super(new Logger(JwtTokenWithHMACKeysProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    try {
      const [header] = this.parse(token);
      if (header.alg !== 'HS256') {
        throw new UnauthorizedException('Invalid JWT token');
      }

      return decode(token, this.privateKey, false, 'HS256');
    } catch (error) {
      this.log.error('Failed to validate HMAC JWT', error instanceof Error ? error.stack : undefined);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to validate JWT token');
    }
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');

    const token = encode(payload, this.privateKey, 'HS256');
    return token;
  }
}
