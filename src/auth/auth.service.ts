import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { KeyCloakService } from '../keycloak/keycloak.service';
import { HttpClientService } from '../httpclient/httpclient.service';
import { AuthModuleConfigProperties } from './auth.module.config.properties';
import { JwtBearerTokenProcessor } from './jwt/jwt.token.bearer.processor';
import { JwtTokenProcessor } from './jwt/jwt.token.processor';
import { JwtTokenWithJKUProcessor } from './jwt/jwt.token.with.jku.processor';
import { JwtTokenWithJWKProcessor } from './jwt/jwt.token.with.jwk.processor';
import { JwtTokenWithRSAKeysProcessor } from './jwt/jwt.token.with.rsa.keys.processor';
import { JwtTokenWithSqlKIDProcessor } from './jwt/jwt.token.with.sql.kid.processor';
import { JwtTokenWithWeakKeyProcessor } from './jwt/jwt.token.with.weak.key.processor';
import { JwtTokenWithX5CKeyProcessor } from './jwt/jwt.token.with.x5c.key.processor';
import { JwtTokenWithX5UKeyProcessor } from './jwt/jwt.token.with.x5u.key.processor';
import { JwtTokenWithHMACKeysProcessor } from './jwt/jwt.token.with.hmac.keys.processor';
import { JwtTokenWithRSASignatureKeysProcessor } from './jwt/jwt.token.with.rsa.signature.keys.processor';

export enum JwtProcessorType {
  RSA,
  SQL_KID,
  WEAK_KEY,
  X5C,
  X5U,
  JKU,
  JWK,
  BEARER,
  HMAC,
  RSA_SIGNATURE,
}

@Injectable()
export class AuthService {
  private processors: Map<JwtProcessorType, JwtTokenProcessor>;

  constructor(
    private readonly configService: ConfigService,
    private readonly em: EntityManager,
    private readonly httpClient: HttpClientService,
    private readonly keyCloakService: KeyCloakService,
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
    const jwkPrivateKey = fs.readFileSync(
      this.configService.get<string>(
        AuthModuleConfigProperties.ENV_JWK_PRIVATE_KEY_LOCATION,
      ),
      'utf8',
    );
    const jwkPublicKey = fs.readFileSync(
      this.configService.get<string>(
        AuthModuleConfigProperties.ENV_JWK_PUBLIC_KEY_LOCATION,
      ),
      'utf8',
    );
    const jwkPublicJson = JSON.parse(
      fs.readFileSync(
        this.configService.get<string>(
          AuthModuleConfigProperties.ENV_JWK_PUBLIC_JSON,
        ),
        'utf8',
      ),
    );
    const jkuUrl = this.configService.get<string>(
      AuthModuleConfigProperties.ENV_JKU_URL,
    );
    const x5uUrl = this.configService.get<string>(
      AuthModuleConfigProperties.ENV_X5U_URL,
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
      new JwtTokenWithJKUProcessor(jwkPrivateKey, this.httpClient, jkuUrl),
    );
    this.processors.set(
      JwtProcessorType.JWK,
      new JwtTokenWithJWKProcessor(jwkPrivateKey, jwkPublicJson),
    );
    this.processors.set(
      JwtProcessorType.X5C,
      new JwtTokenWithX5CKeyProcessor(jwkPrivateKey),
    );
    this.processors.set(
      JwtProcessorType.X5U,
      new JwtTokenWithX5UKeyProcessor(jwkPrivateKey, this.httpClient, x5uUrl),
    );

    this.processors.set(
      JwtProcessorType.BEARER,
      new JwtBearerTokenProcessor(jwtSecretKey, this.keyCloakService),
    );

    this.processors.set(
      JwtProcessorType.HMAC,
      new JwtTokenWithHMACKeysProcessor(publicKey, privateKey),
    );
    this.processors.set(
      JwtProcessorType.RSA_SIGNATURE,
      new JwtTokenWithRSASignatureKeysProcessor(publicKey, privateKey),
    );
  }

  validateToken(token: string, processor: JwtProcessorType): Promise<any> {
    return this.processors.get(processor).validateToken(token);
  }

  createToken(payload: unknown, processor: JwtProcessorType): Promise<string> {
    return this.processors.get(processor).createToken(payload);
  }
}
