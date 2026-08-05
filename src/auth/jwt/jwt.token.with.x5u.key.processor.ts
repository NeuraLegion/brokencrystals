import { Logger, UnauthorizedException } from '@nestjs/common';
import * as jose from 'jose';
import { HttpClientService } from '../../httpclient/httpclient.service';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';
export class JwtTokenWithX5UKeyProcessor extends JwtTokenProcessor {
  constructor(
    private key: string,
    private httpClient: HttpClientService,
    private x5uUrl: string
  ) {
    super(new Logger(JwtTokenWithX5UKeyProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    try {
      const [header] = this.parse(token);
      const url = header.x5u;

      if (typeof url !== 'string' || !url.trim().length) {
        throw new UnauthorizedException('Invalid token');
      }

      if (url !== this.x5uUrl) {
        this.log.warn('Rejected X5U token with unexpected x5u header');
        throw new UnauthorizedException('Invalid token');
      }

      this.log.debug(`Loading key from configured x5u endpoint`);
      const crtPayload = await this.httpClient.loadPlain(this.x5uUrl);
      const x509 = await jose.importX509(crtPayload, 'RS256');

      return jose.jwtVerify(token, x509);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log.warn(`Failed to validate X5U token: ${message}`);
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
        x5u: this.x5uUrl
      })
      .sign(pkcs8);
  }
}
