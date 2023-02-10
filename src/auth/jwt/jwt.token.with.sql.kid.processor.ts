import { EntityManager } from '@mikro-orm/core';
import { Logger } from '@nestjs/common';
import { decode, encode } from 'jwt-simple';
import { JwtHeader } from './jwt.header';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithSqlKIDProcessor extends JwtTokenProcessor {
  private static readonly KID: number = 0;
  private static readonly KID_FETCH_QUERY = (key: string, param: string) =>
    `select key from (select '${key}' as key, ${JwtTokenWithSqlKIDProcessor.KID} as id) as keys where keys.id = '${param}'`;

  constructor(private readonly em: EntityManager, private key: string) {
    super(new Logger(JwtTokenWithSqlKIDProcessor.name));
  }

  async validateToken(token: string): Promise<any> {
    this.log.debug('Call validateToken');

    const [header, payload] = this.parse(token);

    const query = JwtTokenWithSqlKIDProcessor.KID_FETCH_QUERY(
      this.key,
      header.kid,
    );
    this.log.debug(`Executing key fetching query: ${query}`);
    const keyRow: { key: string } = await this.em
      .getConnection()
      .execute(query);
    this.log.debug(`Key is ${keyRow.key}`);

    return decode(token, this.key, false, 'HS256');
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');
    const header: JwtHeader = {
      alg: 'HS256',
      kid: `${JwtTokenWithSqlKIDProcessor.KID}`,
      typ: 'JWT',
    };
    const token = encode(payload, this.key, 'HS256', {
      header,
    });
    return token;
  }
}
