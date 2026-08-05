import { Logger, UnauthorizedException } from '@nestjs/common';
import * as jose from 'jose';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithX5CKeyProcessor extends JwtTokenProcessor {
  constructor(private key: string) {
    super(new Logger(JwtTokenWithX5CKeyProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');
    const [header] = this.parse(token);
    const keys = header.x5c;

    if (!Array.isArray(keys) || !keys.length || typeof keys[0] !== 'string') {
      throw new UnauthorizedException({ error: 'Unauthorized' });
    }

    const candidateKey = keys[0].trim();
    const hasPemMarkers =
      candidateKey.includes('-----BEGIN PRIVATE KEY-----') &&
      candidateKey.includes('-----END PRIVATE KEY-----');

    if (!hasPemMarkers) {
      this.log.warn('Rejected malformed X5C JWT key material');
      throw new UnauthorizedException({ error: 'Unauthorized' });
    }

    try {
      const keyLike = await jose.importPKCS8(candidateKey, 'RS256');
      this.log.debug('Validating X5C JWT with provided key material');
      return await jose.jwtVerify(token, keyLike);
    } catch {
      this.log.warn('Failed to validate X5C JWT');
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
        x5c: [this.key]
      })
      .sign(pkcs8);
  }
}
