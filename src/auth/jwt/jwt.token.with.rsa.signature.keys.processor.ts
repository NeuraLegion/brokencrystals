import { Logger } from '@nestjs/common';
import { encode } from 'jwt-simple';
import { createVerify } from 'crypto';
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

    const tokenParts = token.split('.');

    if (tokenParts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = tokenParts;
    const header = JSON.parse(
      Buffer.from(encodedHeader, 'base64url').toString('utf8')
    ) as { alg?: string; typ?: string };

    if (header.alg !== 'RS256') {
      throw new Error('Invalid JWT algorithm');
    }

    if (!encodedSignature?.length) {
      throw new Error('Missing JWT signature');
    }

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();

    const isValid = verifier.verify(
      this.publicKey,
      Buffer.from(encodedSignature, 'base64url')
    );

    if (!isValid) {
      throw new Error('Invalid JWT signature');
    }

    return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');

    const token = encode(payload, this.privateKey, 'RS256');
    return token;
  }
}
