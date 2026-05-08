import { Logger, UnauthorizedException } from '@nestjs/common';
import * as jose from 'jose';
import { HttpClientService } from '../../httpclient/httpclient.service';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithJKUProcessor extends JwtTokenProcessor {
  constructor(
    private key: string,
    private httpClient: HttpClientService,
    private jkuUrl: string
  ) {
    super(new Logger(JwtTokenWithJKUProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    try {
      const [header, payload] = this.parse(token);
      const url = header?.jku;

      if (typeof url !== 'string' || !url.length) {
        throw new UnauthorizedException('Invalid JWT token');
      }

      this.log.debug(`Calling configured jwk validation flow`);
      const jwkRes: jose.JWK = await this.httpClient.loadJSON(url);
      const keyLike = await jose.importJWK(jwkRes);
      const verifyRes = await jose.jwtVerify(token, keyLike);
      if (verifyRes) {
        return payload;
      }
    } catch {
      throw new UnauthorizedException('Invalid JWT token');
    }

    throw new UnauthorizedException('Invalid JWT token');
  }

  async createToken(payload: jose.JWTPayload): Promise<string> {
    this.log.debug('Call createToken');
    const pkcs8 = await jose.importPKCS8(this.key, 'RS256');
    return new jose.SignJWT(payload)
      .setProtectedHeader({
        typ: 'JWT',
        alg: 'RS256',
        jku: this.jkuUrl
      })
      .sign(pkcs8);
  }
}
