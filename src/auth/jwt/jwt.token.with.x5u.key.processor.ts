import { Logger } from '@nestjs/common';
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

    const url = header.x5u;
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
      throw new Error('Invalid x5u header');
    }

    this.log.debug('Loading key from x5u header');
    const crtPayload = await this.httpClient.loadPlain(url);
    const x509 = await jose.importX509(crtPayload, 'RS256');

    return jose.jwtVerify(token, x509);
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
