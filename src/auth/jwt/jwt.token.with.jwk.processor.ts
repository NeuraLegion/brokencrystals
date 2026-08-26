import { Logger, UnauthorizedException } from '@nestjs/common';
import * as jose from 'jose';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithJWKProcessor extends JwtTokenProcessor {
  constructor(
    private key: string,
    private jwk: jose.JWK
  ) {
    super(new Logger(JwtTokenWithJWKProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    try {
      const [header, payload] = this.parse(token);

      if (!header.jwk) {
        throw new UnauthorizedException({ error: 'Unauthorized' });
      }

      if (!header.jwk.kty) {
        return payload;
      }

      const keyLike = await jose.importJWK(header.jwk);
      const res = await jose.jwtVerify(token, keyLike);

      if (res) {
        return payload;
      }

      throw new UnauthorizedException({ error: 'Unauthorized' });
    } catch (error) {
      this.log.warn('Failed to validate JWK token');

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException({ error: 'Unauthorized' });
    }
  }

  async createToken(payload: jose.JWTPayload): Promise<string> {
    this.log.debug('Call createToken');
    const pkcs8 = await jose.importPKCS8(this.key, 'RS256');
    return new jose.SignJWT(payload)
      .setProtectedHeader({
        typ: 'JWT',
        alg: 'RS256',
        jwk: this.jwk
      })
      .sign(pkcs8);
  }
}
