import { Logger, UnauthorizedException } from '@nestjs/common';
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

      const keys = header.x5c;
      if (!Array.isArray(keys) || !keys.length || typeof keys[0] !== 'string') {
        throw new UnauthorizedException({
          error: 'Invalid token'
        });
      }

      const keyLike = await jose.importPKCS8(keys[0], 'RS256');
      this.log.debug('Taking x5c certificate from token header');
      return await jose.jwtVerify(token, keyLike);
    } catch (err) {
      this.log.warn(`X5C token validation failed: ${err?.message ?? err}`);
      throw new UnauthorizedException({
        error: 'Invalid token'
      });
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
