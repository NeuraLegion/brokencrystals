import { Logger } from '@nestjs/common';
import { decode, encode } from 'jwt-simple';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithRSASignatureKeysProcessor extends JwtTokenProcessor {
  private static readonly ALGORITHM = 'RS256';

  constructor(
    private publicKey: string,
    private privateKey: string
  ) {
    super(new Logger(JwtTokenWithRSASignatureKeysProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    const [header] = this.parse(token);
    if (header.alg !== JwtTokenWithRSASignatureKeysProcessor.ALGORITHM) {
      throw new Error('Invalid JWT algorithm');
    }

    return decode(token, this.publicKey, true, JwtTokenWithRSASignatureKeysProcessor.ALGORITHM);
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');

    const token = encode(payload, this.privateKey, JwtTokenWithRSASignatureKeysProcessor.ALGORITHM);
    return token;
  }
}
