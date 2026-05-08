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

      if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
        throw new UnauthorizedException('Unauthorized');
      }

      const trustedX5uUrl = new URL(this.x5uUrl);
      const requestedX5uUrl = new URL(url);
      if (
        requestedX5uUrl.protocol !== trustedX5uUrl.protocol ||
        requestedX5uUrl.host !== trustedX5uUrl.host ||
        requestedX5uUrl.pathname !== trustedX5uUrl.pathname
      ) {
        throw new UnauthorizedException('Unauthorized');
      }

      this.log.debug('Loading key from trusted x5u header');
      const crtPayload = await this.httpClient.loadPlain(requestedX5uUrl.toString());
      const x509 = await jose.importX509(crtPayload, 'RS256');

      return await jose.jwtVerify(token, x509);
    } catch (error) {
      this.log.warn(
        'Failed to validate X5U JWT',
        error instanceof Error ? error.stack : undefined
      );
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
        x5u: this.x5uUrl
      })
      .sign(pkcs8);
  }
}
