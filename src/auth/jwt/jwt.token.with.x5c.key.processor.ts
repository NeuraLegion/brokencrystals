import { Logger } from '@nestjs/common';
import * as jose from 'jose';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithX5CKeyProcessor extends JwtTokenProcessor {
  constructor(private key: string) {
    super(new Logger(JwtTokenWithX5CKeyProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    try {
      const [header] = this.parse(token);
      const x5c = header?.x5c;

      if (!Array.isArray(x5c) || typeof x5c[0] !== 'string' || !x5c[0].trim()) {
        throw new Error('Invalid x5c header');
      }

      const keyLike = await jose.importPKCS8(x5c[0], 'RS256');
      return await jose.jwtVerify(token, keyLike);
    } catch {
      throw new Error('Unauthorized');
    }
  }

  async createToken(payload: jose.JWTPayload): Promise<string> {
    this.log.debug('Call createToken');
    const pkcs8 = await jose.importPKCS8(this.key, 'RS256');
    return new jose.SignJWT(payload)
      .setProtectedHeader({
        typ: 'JWT',
        alg: 'RS256',
        x5c: [this.key]
      })
      .sign(pkcs8);
  }
}
