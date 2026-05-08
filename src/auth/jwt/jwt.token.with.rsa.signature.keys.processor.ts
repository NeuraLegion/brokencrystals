import { createVerify } from 'crypto';
import { BadRequestException, Logger, UnauthorizedException } from '@nestjs/common';
import { encode } from 'jwt-simple';
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

    const parts = token.split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      throw new BadRequestException('Invalid JWT token');
    }

    const [header, payload] = this.parse(token);
    if (header.alg !== JwtTokenWithRSASignatureKeysProcessor.EXPECTED_ALG) {
      throw new UnauthorizedException('Invalid JWT algorithm');
    }

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();

    const signature = Buffer.from(parts[2], 'base64url');
    if (!signature.length || !verifier.verify(this.publicKey, signature)) {
      throw new UnauthorizedException('Invalid JWT signature');
    }

    return payload;
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');

    const token = encode(payload, this.privateKey, 'RS256');
    return token;
  }
}
