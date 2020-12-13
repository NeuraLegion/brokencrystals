import { Logger } from '@nestjs/common';
import { decode, encode } from 'jwt-simple';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithRSAKeysProcessor extends JwtTokenProcessor {
  constructor(private publicKey: string, private privateKey: string) {
    super(new Logger(JwtTokenWithRSAKeysProcessor.name));
  }

  async validateToken(token: string): Promise<any> {
    this.log.debug('Call validateToken');

    const [header, payload] = this.parse(token);
    if (header.alg === 'None') {
      return payload;
    }
    return decode(token, this.publicKey, false, header.alg);
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');

    const token = encode(payload, this.privateKey, 'RS256');
    return token;
  }
}
