import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithHMACKeysProcessor extends JwtTokenProcessor {
  private static readonly EXPECTED_ALG = 'HS256';

  constructor(private privateKey: string) {
    super(new Logger(JwtTokenWithHMACKeysProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    const [header] = this.parse(token);

    if (!header || header.alg !== JwtTokenWithHMACKeysProcessor.EXPECTED_ALG) {
      throw new Error('Invalid JWT algorithm');
    }

    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        this.privateKey,
        {
          algorithms: [JwtTokenWithHMACKeysProcessor.EXPECTED_ALG],
          complete: false,
          clockTolerance: 0
        },
        (err, decoded) => {
          if (err) {
            return reject(new Error('Invalid JWT signature'));
          }

          if (!decoded || typeof decoded !== 'object') {
            return reject(new Error('Invalid JWT payload'));
          }

          resolve(decoded);
        }
      );
    });
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');

    return jwt.sign(payload as jwt.JwtPayload, this.privateKey, {
      algorithm: JwtTokenWithHMACKeysProcessor.EXPECTED_ALG,
      noTimestamp: true
    });
  }
}
