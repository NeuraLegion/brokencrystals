import { Logger } from '@nestjs/common';
import * as jose from 'jose';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithJWKProcessor extends JwtTokenProcessor {
  private static readonly ALLOWED_JWK_KTY = new Set(['RSA', 'EC', 'OKP']);

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

      if (!this.isSupportedJwkHeader(header.jwk)) {
        throw new Error('Invalid JWT token');
      }

      const keyLike = await jose.importJWK(header.jwk);

      const res = await jose.jwtVerify(token, keyLike, {
        algorithms: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'EdDSA']
      });

      if (res) {
        return payload;
      }

      throw new Error('Invalid JWT token');
    } catch (error) {
      this.log.warn('Rejected invalid JWK JWT token');
      throw new Error('Invalid JWT token');
    }
  }

  private isSupportedJwkHeader(jwk: unknown): jwk is jose.JWK {
    return !!jwk && typeof jwk === 'object' && JwtTokenWithJWKProcessor.ALLOWED_JWK_KTY.has((jwk as jose.JWK).kty);
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
