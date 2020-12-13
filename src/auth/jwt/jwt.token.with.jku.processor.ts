import { Logger } from '@nestjs/common';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';
import { encode } from 'jwt-simple';
import { HttpClientService } from '../../httpclient/httpclient.service';
import * as jose from 'jose';
import verify from 'jose';

export class JwtTokenWithJKUProcessor extends JwtTokenProcessor {
  constructor(private key: string, private httpClient: HttpClientService) {
    super(new Logger(JwtTokenWithJKUProcessor.name));
  }

  async validateToken(token: string): Promise<any> {
    this.log.debug('Call validateToken');
    const [header, payload] = this.parse(token);
    if (header.alg === 'None') {
      return payload;
    }
    const url = header.jku;
    this.log.debug(`Calling jwk url: ${url}`);
    const jwkRes = await this.httpClient.loadJSON(url);
    let keyLike = await jose.JWK.asKey(JSON.stringify(jwkRes));
    const verifyRes = await jose.JWT.verify(token, keyLike);
    if (verifyRes) {
      return payload;
    }
    throw new Error('Could not validate');
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');
    return encode(payload, this.key, 'HS256');
  }
}
