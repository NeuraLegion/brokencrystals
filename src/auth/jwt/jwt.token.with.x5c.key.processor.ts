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
      const keys = header.x5c;

      if (!Array.isArray(keys) || typeof keys[0] !== 'string' || !keys[0]) {
        throw new Error('Invalid JWT token');
      }

      // x5c contains an X.509 certificate chain, not a PKCS8 private key.
      // Use the first certificate from the chain for verification.
      const x509 = await jose.importX509(keys[0], 'RS256');
      return await jose.jwtVerify(token, x509);
    } catch (error) {
      this.log.error(
        'Failed to validate X5C JWT',
        error instanceof Error ? error.stack : undefined
      );
      throw new Error('Invalid JWT token');
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
