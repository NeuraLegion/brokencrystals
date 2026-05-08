import { Logger, UnauthorizedException } from '@nestjs/common';
import * as jose from 'jose';
import { X509Certificate } from 'crypto';
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

      if (
        !Array.isArray(x5c) ||
        x5c.length === 0 ||
        typeof x5c[0] !== 'string' ||
        !/^[A-Za-z0-9+/=\r\n]+$/.test(x5c[0])
      ) {
        throw new UnauthorizedException('Unauthorized');
      }

      const normalizedCertificate = x5c[0].replace(/\s+/g, '');
      const certificate = new X509Certificate(
        `-----BEGIN CERTIFICATE-----\n${normalizedCertificate}\n-----END CERTIFICATE-----`
      );
      const publicKey = certificate.publicKey.export({ type: 'spki', format: 'pem' });
      const keyLike = await jose.importSPKI(publicKey.toString(), 'RS256');

      return await jose.jwtVerify(token, keyLike, {
        algorithms: ['RS256']
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Unauthorized');
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
