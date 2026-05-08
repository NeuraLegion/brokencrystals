import { BadRequestException, Logger, UnauthorizedException } from '@nestjs/common';
import { TokenExpiredError } from 'jsonwebtoken';
import { encode } from 'jwt-simple';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';
import { KeyCloakService } from '../../keycloak/keycloak.service';

export class JwtBearerTokenProcessor extends JwtTokenProcessor {
  constructor(
    private readonly key: string,
    private readonly keyCloakService: KeyCloakService
  ) {
    super(new Logger(JwtBearerTokenProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    const [header, payload] = this.parse(token);
    if (!header || !payload) {
      this.log.debug(`Invalid JWT token. parse() failure.`);
      throw new BadRequestException('Invalid JWT token');
    }

    if (!header.kid) {
      this.log.debug(
        `Invalid JWT token. Expected a known KID but found ${header.kid}.`
      );
      throw new BadRequestException('Invalid JWT token');
    }

    await this.decodeAndVerifyToken(token, header.kid);

    return payload;
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');
    return encode(payload, this.key, 'HS256');
  }

  async introspect(token: string): Promise<Record<string, string>> {
    try {
      const body = await this.keyCloakService.introspectToken(token);

      if (!body || !body.sub) {
        throw new UnauthorizedException('Invalid JWT token');
      }
      this.log.debug(`Successfully introspection ${token} JWT token.`);
      return body;
    } catch (e) {
      if (e.statusCode === 401) {
        throw new UnauthorizedException('Invalid JWT token');
      }
      this.log.debug(`Failed to introspect JWT token. err: ${e.message}`);
      throw new UnauthorizedException('Invalid JWT token');
    }
  }

  private async decodeAndVerifyToken(
    token: string,
    kid: string
  ): Promise<unknown> {
    try {
      return await this.keyCloakService.verifyToken(token, kid);
    } catch (e) {
      this.log.debug(`Invalid JWT token. jwt.verify() failed: ${e.message}.`);
      if (e instanceof TokenExpiredError) {
        throw new UnauthorizedException('Invalid JWT token');
      }
      throw new UnauthorizedException('Invalid JWT token');
    }
  }
}
