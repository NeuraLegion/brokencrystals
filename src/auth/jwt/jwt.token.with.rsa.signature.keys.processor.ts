import { Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { JwtPayload, SignOptions, VerifyOptions, sign, verify } from 'jsonwebtoken';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithRSASignatureKeysProcessor extends JwtTokenProcessor {
  constructor(
    private publicKey: string,
    private privateKey: string
  ) {
    super(new Logger(JwtTokenWithRSASignatureKeysProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    const verifyOptions: VerifyOptions = {
      algorithms: ['RS256']
    };

    return verify(token, this.publicKey, verifyOptions);
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');

    const signOptions: SignOptions = {
      algorithm: 'RS256'
    };

    return sign(payload as JwtPayload | string | Buffer, this.privateKey, signOptions);
  }
}