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

      if (!Array.isArray(keys) || !keys.length) {
        throw new UnauthorizedException({
          error: 'Unauthorized'
        });
      }

      const signingKey = keys[0];

      if (
        typeof signingKey !== 'string' ||
        !signingKey.length ||
        signingKey.length > 10000 ||
        !this.isPemFormattedPrivateKey(signingKey)
      ) {
        throw new UnauthorizedException({
          error: 'Unauthorized'
        });
      }

      const keyLike = await jose.importPKCS8(signingKey, 'RS256');
      this.log.debug('Using x5c key from token header');
      return await jose.jwtVerify(token, keyLike);
    } catch {
      throw new UnauthorizedException({
        error: 'Unauthorized'
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

  private isPemFormattedPrivateKey(key: string): boolean {
    const trimmedKey = key.trim();

    return (
      trimmedKey.startsWith('-----BEGIN PRIVATE KEY-----') &&
      trimmedKey.endsWith('-----END PRIVATE KEY-----')
    );
  }
}
