import { Logger } from '@nestjs/common';
import { decode, encode } from 'jwt-simple';
import { HttpClientService } from '../../httpclient/httpclient.service';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithX5UKeyProcessor extends JwtTokenProcessor {
  constructor(private key: string, private httpClient: HttpClientService) {
    super(new Logger(JwtTokenWithX5UKeyProcessor.name));
  }

  async validateToken(token: string): Promise<any> {
    this.log.debug('Call validateToken');
    const [header, payload] = this.parse(token);
    if (header.alg === 'None') {
      return payload;
    }
    const url = header.x5u;
    this.log.debug(`Loading key from url ${url}`);
    const crtPayload = await this.httpClient.loadPlain(url);
    return decode(token, this.parseCRTChain(crtPayload), false, header.alg);
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');
    return encode(payload, this.key, 'HS256');
  }
}
