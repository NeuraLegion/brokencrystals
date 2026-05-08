import { EntityManager } from '@mikro-orm/core';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { decode, encode } from 'jwt-simple';
import { JwtHeader } from './jwt.header';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithSqlKIDProcessor extends JwtTokenProcessor {
  private static readonly KID: number = 0;

  constructor(
    private readonly em: EntityManager,
    private key: string
  ) {
    super(new Logger(JwtTokenWithSqlKIDProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    try {
      const [header] = this.parse(token);
      const kid = `${header.kid ?? ''}`;

      if (!/^[0-9]+$/.test(kid)) {
        this.log.warn('Rejected token with invalid kid format');
        throw new UnauthorizedException('Unauthorized');
      }

      const keyRow: { key: string } = await this.em
        .getConnection()
        .execute(
          `select key from (select ? as key, ? as id) as keys where keys.id = ?`,
          [this.key, JwtTokenWithSqlKIDProcessor.KID, Number(kid)],
          'get'
        );
      this.log.debug('Key fetched successfully');

      return decode(token, keyRow.key, false, 'HS256');
    } catch (error) {
      this.log.warn(
        'Failed to validate SQL kid token',
        error instanceof Error ? error.stack : undefined
      );
      throw new UnauthorizedException('Unauthorized');
    }
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');
    const header: JwtHeader = {
      alg: 'HS256',
      kid: `${JwtTokenWithSqlKIDProcessor.KID}`,
      typ: 'JWT'
    };
    const token = encode(payload, this.key, 'HS256', {
      header
    });
    return token;
  }
}
