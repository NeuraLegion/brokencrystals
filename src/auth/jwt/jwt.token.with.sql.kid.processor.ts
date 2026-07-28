import { EntityManager } from '@mikro-orm/core';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { decode, encode } from 'jwt-simple';
import { JwtHeader } from './jwt.header';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithSqlKIDProcessor extends JwtTokenProcessor {
  private static readonly KID: number = 0;
  private static readonly KID_FETCH_QUERY =
    'select key from (select ? as key, ? as id) as keys where keys.id = ?';

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
      const rawKid = header?.kid;

      if (typeof rawKid !== 'string' || !/^\d+$/.test(rawKid)) {
        throw new UnauthorizedException({ error: 'Unauthorized' });
      }

      const kid = Number(rawKid);
      if (!Number.isSafeInteger(kid)) {
        throw new UnauthorizedException({ error: 'Unauthorized' });
      }

      const keyRow = (await this.em
        .getConnection()
        .execute(
          JwtTokenWithSqlKIDProcessor.KID_FETCH_QUERY,
          [this.key, JwtTokenWithSqlKIDProcessor.KID, kid],
          'get'
        )) as { key?: unknown } | null;

      if (!keyRow || typeof keyRow.key !== 'string' || !keyRow.key.length) {
        throw new UnauthorizedException({ error: 'Unauthorized' });
      }

      return decode(token, keyRow.key, false, 'HS256');
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.log.warn('Failed to validate SQL KID JWT token');
      throw new UnauthorizedException({ error: 'Unauthorized' });
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
