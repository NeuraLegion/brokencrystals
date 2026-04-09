import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithRSASignatureKeysProcessor extends JwtTokenProcessor {
  private static readonly EXPECTED_ALG = 'RS256';

  constructor(
    private publicKey: string,
    private privateKey: string
  ) {
    super(new Logger(JwtTokenWithRSASignatureKeysProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    const [header] = this.parse(token);

    if (!header || header.alg !== JwtTokenWithRSASignatureKeysProcessor.EXPECTED_ALG) {
      throw new Error('Invalid JWT algorithm');
    }

    return this.verifyTokenStrict(token, this.publicKey);
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');

    return jwt.sign(payload as jwt.JwtPayload, this.privateKey, {
      algorithm: JwtTokenWithRSASignatureKeysProcessor.EXPECTED_ALG,
      noTimestamp: true
    });
  }

  private verifyTokenStrict(token: string, key: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        key,
        {
          algorithms: [JwtTokenWithRSASignatureKeysProcessor.EXPECTED_ALG],
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
}
