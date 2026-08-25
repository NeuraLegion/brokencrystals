import { Logger, UnauthorizedException } from '@nestjs/common';
import * as jose from 'jose';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithX5CKeyProcessor extends JwtTokenProcessor {
  private static readonly MAX_X5C_CERTIFICATE_LENGTH = 8192;
  private static readonly X5C_ALLOWED_CHARACTERS = /^[A-Za-z0-9+/=\r\n\s-]+$/;

  constructor(private key: string) {
    super(new Logger(JwtTokenWithX5CKeyProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    try {
      const [header] = this.parse(token);
      const keys = header.x5c;

      if (
        !Array.isArray(keys) ||
        !keys.length ||
        typeof keys[0] !== 'string' ||
        !keys[0].trim().length
      ) {
        throw new UnauthorizedException('Invalid token');
      }

      const certificate = this.normalizeX5CCertificate(keys[0]);
      const keyLike = await jose.importX509(certificate, 'RS256');
      this.log.debug('Validated X5C certificate header for token verification');
      return await jose.jwtVerify(token, keyLike);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.log.warn('Invalid X5C token presented for validation');
      throw new UnauthorizedException('Invalid token');
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

  private normalizeX5CCertificate(certificate: string): string {
    const trimmedCertificate = certificate.trim();

    if (
      !trimmedCertificate.length ||
      trimmedCertificate.length >
        JwtTokenWithX5CKeyProcessor.MAX_X5C_CERTIFICATE_LENGTH ||
      !JwtTokenWithX5CKeyProcessor.X5C_ALLOWED_CHARACTERS.test(
        trimmedCertificate
      )
    ) {
      throw new UnauthorizedException('Invalid token');
    }

    if (
      trimmedCertificate.includes('-----BEGIN CERTIFICATE-----') ||
      trimmedCertificate.includes('-----END CERTIFICATE-----')
    ) {
      if (
        !trimmedCertificate.startsWith('-----BEGIN CERTIFICATE-----') ||
        !trimmedCertificate.endsWith('-----END CERTIFICATE-----')
      ) {
        throw new UnauthorizedException('Invalid token');
      }

      return trimmedCertificate;
    }

    const normalizedBody = trimmedCertificate.replace(/\s+/g, '');

    if (
      !normalizedBody.length ||
      normalizedBody.length % 4 !== 0 ||
      /[^A-Za-z0-9+/=]/.test(normalizedBody)
    ) {
      throw new UnauthorizedException('Invalid token');
    }

    const wrappedBody = normalizedBody.match(/.{1,64}/g)?.join('\n');

    if (!wrappedBody) {
      throw new UnauthorizedException('Invalid token');
    }

    return `-----BEGIN CERTIFICATE-----\n${wrappedBody}\n-----END CERTIFICATE-----`;
  }
}
