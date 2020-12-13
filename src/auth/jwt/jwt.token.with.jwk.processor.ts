import { Logger } from '@nestjs/common';
import * as jose from 'jose';
import { encode } from 'jwt-simple';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithJWKProcessor extends JwtTokenProcessor {
  constructor(private key: string) {
    super(new Logger(JwtTokenWithJWKProcessor.name));
  }

  async validateToken(token: string): Promise<any> {
    this.log.debug('Call validateToken');
    const [header, payload] = this.parse(token);
    if (header.alg === 'None') {
      return payload;
    }
    if (!header.jwk) {
      throw new Error('Unsupported token. JWK is not set');
    }

    if (!header.jwk.kty) {
      return payload;
    }
    const keyLike = await jose.JWK.asKey(JSON.stringify(header.jwk));

    const res = await jose.JWT.verify(token, keyLike);

    if (res) {
      return payload;
    }
    throw new Error('Could not validate token');
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');
    return encode(payload, this.key, 'HS256');
  }
}
