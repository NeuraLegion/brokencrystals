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
    const [header] = this.parse(token);

    try {
      const url = header.x5u;
      if (!url || url !== this.x5uUrl) {
        throw new Error('Invalid x5u');
      }

      this.log.debug(`Loading key from configured x5u url`);
      const crtPayload = await this.httpClient.loadPlain(url);
      const x509 = await jose.importX509(crtPayload, 'RS256');

      return await jose.jwtVerify(token, x509);
    } catch (err) {
      this.log.warn('X5U token validation failed');
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
        x5u: this.x5uUrl
      })
      .sign(pkcs8);
  }
}
