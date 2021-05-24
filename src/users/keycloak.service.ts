import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientService } from '../httpclient/httpclient.service';
import { KeyCloakConfigs } from './keycloak.configs';
import { stringify } from 'qs';
import {
  Secret,
  GetPublicKeyOrSecret,
  verify as verifyCallbackStyle,
  VerifyOptions,
} from 'jsonwebtoken';
import { promisify } from 'util';
import * as jwkToPem from 'jwk-to-pem';
import { JWK } from 'jwk-to-pem';

const verify: (
  token: string,
  secretOrPublicKey: Secret | GetPublicKeyOrSecret,
  options?: VerifyOptions,
) => Promise<Record<string, any> | string> = promisify(verifyCallbackStyle);

interface KeyCloakToken {
  access_token: string;
  expires_in: number;
  refresh_expires_in: number;
  refresh_token: string;
  token_type: string;
}

interface OidcConfig {
  issuer: string;
  introspection_endpoint: string;
  jwks_uri: string;
  token_endpoint: string;
}

interface Key {
  kid: string;
}

interface Cert {
  keys: Array<Key & JWK>;
}

@Injectable()
export class KeyCloakService {
  private log: Logger = new Logger(KeyCloakService.name);
  private keyCloakUsersUri: string;
  private userName: string;
  private userSecret: string;
  private userId: string;
  private config: OidcConfig;
  private cert: Cert;
  private _issuer: string;

  get issuer(): string {
    return this._issuer;
  }

  constructor(
    private readonly configService: ConfigService,
    private readonly httpClient: HttpClientService,
  ) {
    this.loadJwtConfigs();

    this.keyCloakUsersUri = this.configService.get(
      KeyCloakConfigs.ENV_KEYCLOAK_USERS_URI,
    );
    this.userName = this.configService.get(
      KeyCloakConfigs.ENV_KEYCLOAK_CLIENT_ID,
    );
    this.userSecret = this.configService.get(
      KeyCloakConfigs.ENV_KEYCLOAK_CLIENT_SECRET,
    );
    this.userId = this.configService.get(KeyCloakConfigs.ENV_KEYCLOAK_USERS_ID);
  }

  public async getAccessToken(username: string, password: string) {
    const data = stringify({
      password,
      username,
      grant_type: 'password',
      client_id: this.userId,
    });

    const {
      access_token: accessToken,
      token_type: tokenType,
    } = await this.httpClient.post<KeyCloakToken>(
      this.config.token_endpoint,
      data,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        responseType: 'json',
      },
    );
    return {
      accessToken,
      tokenType,
    };
  }

  public async registerUser(
    email: string,
    firstName: string,
    lastName: string,
    password: string,
  ): Promise<void> {
    this.log.debug(`Called registerUser`);

    const { accessToken, tokenType } = await this.getAccessToken(
      this.userName,
      this.userSecret,
    );

    await this.httpClient.post(
      this.keyCloakUsersUri,
      {
        firstName,
        lastName,
        email,
        enabled: true,
        username: email,
        credentials: [
          {
            type: 'password',
            value: password,
            temporary: false,
          },
        ],
      },
      {
        headers: {
          Authorization: `${tokenType} ${accessToken}`,
        },
        responseType: 'json',
      },
    );
  }

  public async findByEmail(email: string) {
    const { accessToken, tokenType } = await this.getAccessToken(
      this.userName,
      this.userSecret,
    );

    return this.httpClient.get(this.keyCloakUsersUri, {
      params: {
        email,
      },
      headers: {
        Authorization: `${tokenType} ${accessToken}`,
      },
      responseType: 'json',
    });
  }

  public async introspectToken(token: string): Promise<Record<string, string>> {
    const { accessToken, tokenType } = await this.getAccessToken(
      this.userName,
      this.userSecret,
    );
    const data = stringify({
      token,
    });

    return this.httpClient.post(this.config.introspection_endpoint, data, {
      headers: {
        Authorization: `${tokenType} ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }

  public async verifyToken(token: string, kid: string) {
    const jwk = this.cert.keys.find((x) => x.kid === kid);
    const pem = jwkToPem(jwk);

    return verify(token, pem, {
      issuer: this.config.issuer,
    });
  }

  private async loadJwtConfigs(): Promise<void> {
    const jwtConfigsUri = this.configService.get<string>(
      KeyCloakConfigs.ENV_KEYCLOAK_CONFIGS_URI,
    );
    this.config = (await this.httpClient.loadJSON(jwtConfigsUri)) as OidcConfig;
    this.cert = (await this.httpClient.loadJSON(this.config.jwks_uri)) as Cert;
  }
}
