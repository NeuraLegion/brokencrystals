import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { HttpClientService } from '../httpclient/httpclient.service';
import { AuthModuleConfigProperties } from './auth.module.config.properties';
import { JwtTokenProcessor } from './jwt/jwt.token.processor';
import { JwtTokenWithJKUProcessor } from './jwt/jwt.token.with.jku.processor';
import { JwtTokenWithJWKProcessor } from './jwt/jwt.token.with.jwk.processor';
import { JwtTokenWithRSAKeysProcessor } from './jwt/jwt.token.with.rsa.keys.processor';
import { JwtTokenWithSqlKIDProcessor } from './jwt/jwt.token.with.sql.kid.processor';
import { JwtTokenWithWeakKeyProcessor } from './jwt/jwt.token.with.weak.key.processor';
import { JwtTokenWithX5CKeyProcessor } from './jwt/jwt.token.with.x5c.key.processor';
import { JwtTokenWithX5UKeyProcessor } from './jwt/jwt.token.with.x5u.key.processor';

export enum JwtProcessorType {
  RSA,
  SQL_KID,
  WEAK_KEY,
  X5C,
  X5U,
  JKU,
  JWK,
}

@Injectable()
export class AuthService {
  private processors: Map<JwtProcessorType, JwtTokenProcessor>;

  constructor(
    private readonly configService: ConfigService,
    private readonly em: EntityManager,
    private readonly httpClient: HttpClientService,
  ) {
    const privateKey = fs.readFileSync(
      this.configService.get<string>(
        AuthModuleConfigProperties.ENV_JWT_PRIVATE_KEY_LOCATION,
      ),
      'utf8',
    );
    const publicKey = fs.readFileSync(
      this.configService.get<string>(
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
    this.processors.set(
      JwtProcessorType.JKU,
      new JwtTokenWithJKUProcessor(jwtSecretKey, this.httpClient),
    );
    this.processors.set(
      JwtProcessorType.JWK,
      new JwtTokenWithJWKProcessor(jwtSecretKey),
    );
    this.processors.set(
      JwtProcessorType.X5C,
      new JwtTokenWithX5CKeyProcessor(jwtSecretKey),
    );
    this.processors.set(
      JwtProcessorType.X5U,
      new JwtTokenWithX5UKeyProcessor(jwtSecretKey, this.httpClient),
    );
  }

  validateToken(token: string, processor: JwtProcessorType): Promise<any> {
    return this.processors.get(processor).validateToken(token);
  }

  createToken(payload: unknown, processor: JwtProcessorType): Promise<string> {
    return this.processors.get(processor).createToken(payload);
  }
}
