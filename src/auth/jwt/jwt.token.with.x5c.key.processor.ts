import { Logger, UnauthorizedException } from '@nestjs/common';
import * as jose from 'jose';
import { X509Certificate } from 'crypto';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithX5CKeyProcessor extends JwtTokenProcessor {
  private static readonly MAX_X5C_LENGTH = 8192;
  private static readonly BASE64_CERTIFICATE_PATTERN = /^[A-Za-z0-9+/=]+$/;

  constructor(private key: string) {
    super(new Logger(JwtTokenWithX5CKeyProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    try {
      const [header] = this.parse(token);
      const x5c = header?.x5c;

      if (!Array.isArray(x5c) || x5c.length !== 1 || typeof x5c[0] !== 'string') {
        throw new UnauthorizedException('Unauthorized');
      }

      const normalizedCertificate = x5c[0].replace(/\s+/g, '');

      if (
        !normalizedCertificate.length ||
        normalizedCertificate.length > JwtTokenWithX5CKeyProcessor.MAX_X5C_LENGTH ||
        !JwtTokenWithX5CKeyProcessor.BASE64_CERTIFICATE_PATTERN.test(normalizedCertificate)
      ) {
        throw new UnauthorizedException('Unauthorized');
      }

      let certificateBuffer: Buffer;
      try {
        certificateBuffer = Buffer.from(normalizedCertificate, 'base64');
      } catch {
        throw new UnauthorizedException('Unauthorized');
      }

      if (!certificateBuffer.length) {
        throw new UnauthorizedException('Unauthorized');
      }

      const certificate = new X509Certificate(certificateBuffer);
      const publicKey = certificate.publicKey.export({ type: 'spki', format: 'pem' });
      const keyLike = await jose.importSPKI(publicKey.toString(), 'RS256');

      return await jose.jwtVerify(token, keyLike, {
        algorithms: ['RS256']
      });
    } catch (error) {
      this.log.warn('X5C JWT validation failed');

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
