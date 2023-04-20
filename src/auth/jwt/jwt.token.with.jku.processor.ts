import { Logger } from '@nestjs/common';
import * as jose from 'jose';
import { HttpClientService } from '../../httpclient/httpclient.service';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithJKUProcessor extends JwtTokenProcessor {
  constructor(
    private key: string,
    private httpClient: HttpClientService,
    private jkuUrl: string,
  ) {
    super(new Logger(JwtTokenWithJKUProcessor.name));
  }

  async validateToken(token: string): Promise<any> {
    this.log.debug('Call validateToken');
    const [header, payload] = this.parse(token);

    const url = header.jku;
    this.log.debug(`Calling jwk url: ${url}`);
    const jwkRes: jose.JWK = await this.httpClient.loadJSON(url);
    const keyLike = await jose.importJWK(jwkRes);
    const verifyRes = await jose.jwtVerify(token, keyLike);
    if (verifyRes) {
      return payload;
    }
    throw new Error('Could not validate');
  }

  async createToken(payload: jose.JWTPayload): Promise<string> {
    this.log.debug('Call createToken');
    const pkcs8 = await jose.importPKCS8(this.key, 'RS256');
    return new jose.SignJWT(payload)
      .setProtectedHeader({
        typ: 'JWT',
        alg: 'RS256',
        jku: this.jkuUrl,
      })
      .sign(pkcs8);
  }
}
