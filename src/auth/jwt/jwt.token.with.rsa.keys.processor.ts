import { EntityManager } from '@mikro-orm/core';
import { Logger } from '@nestjs/common';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';
import { encode, decode } from 'jwt-simple';
import { JwtHeader } from './jwt.header';

export class JwtTokenWithRSAKeysProcessor extends JwtTokenProcessor {
  constructor(private publicKey: string, private privateKey: string) {
    super(new Logger(JwtTokenWithRSAKeysProcessor.name));
  }

  async validateToken(token: string): Promise<any> {
    this.log.debug('Call validateToken');

    const [header, payload] = this.parse(token);
    if (header.alg === 'None') {
      return payload;
    }
    return decode(token, this.publicKey, false, header.alg);
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');

    const token = encode(payload, this.privateKey, 'RS256');
    return token;
  }
}
