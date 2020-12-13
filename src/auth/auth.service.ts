import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { encode, decode, TAlgorithm } from 'jwt-simple';
import * as fs from 'fs';
import { AuthModuleConfigProperties } from './auth.module.config.properties';
import { JwtHeader } from './jwt/jwt.header';
import { EntityManager } from '@mikro-orm/core';
import { JwtTokenWithRSAKeysProcessor } from './jwt/jwt.token.with.rsa.keys.processor';
import { JwtTokenProcessor } from './jwt/jwt.token.processor';
import { JwtTokenWithSqlKIDProcessor } from './jwt/jwt.token.with.sql.kid.processor';
import { JwtTokenWithWeakKeyProcessor } from './jwt/jwt.token.with.weak.key';

export enum JwtProcessorType {
  RSA,
  SQL_KID,
  WEAK_KEY,
}

@Injectable()
export class AuthService {
  private log: Logger = new Logger(AuthService.name);
  private processors: Map<JwtProcessorType, JwtTokenProcessor>;

  constructor(
    private readonly configService: ConfigService,
    private readonly em: EntityManager,
  ) {
    const privateKey = fs.readFileSync(
      configService.get<string>(
        AuthModuleConfigProperties.ENV_JWT_PRIVATE_KEY_LOCATION,
      ),
      'utf8',
    );
    const publicKey = fs.readFileSync(
      configService.get<string>(
        AuthModuleConfigProperties.ENV_JWT_PUBLIC_KEY_LOCATION,
      ),
      'utf8',
    );

    const jwtSecretKey = configService.get<string>(
      AuthModuleConfigProperties.ENV_JWT_SECRET_KEY,
    );
    this.processors = new Map();
    this.processors.set(
      JwtProcessorType.RSA,
      new JwtTokenWithRSAKeysProcessor(publicKey, privateKey),
    );
    this.processors.set(
      JwtProcessorType.SQL_KID,
      new JwtTokenWithSqlKIDProcessor(this.em, jwtSecretKey),
    );
    this.processors.set(
      JwtProcessorType.WEAK_KEY,
      new JwtTokenWithWeakKeyProcessor(jwtSecretKey),
    );
  }

  async validateToken(
    token: string,
    processor: JwtProcessorType,
  ): Promise<any> {
    return this.processors.get(processor).validateToken(token);
  }

  async createToken(
    payload: unknown,
    processor: JwtProcessorType,
  ): Promise<string> {
    return this.processors.get(processor).createToken(payload);
  }
}
