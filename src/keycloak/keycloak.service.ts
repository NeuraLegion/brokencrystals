import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ok } from 'assert';
import { HttpClientService } from '../httpclient/httpclient.service';
import { KeyCloakConfigProperties } from './keycloak.config.properties';
import * as jwkToPem from 'jwk-to-pem';
import { JWK } from 'jwk-to-pem';
import { stringify } from 'querystring';
import { verify } from 'jsonwebtoken';
import { User } from '../model/user.entity';
import { promisify } from 'util';

export interface OIDCIdentityConfig {
  issuer?: string;
  introspection_endpoint?: string;
  jwks_uri?: string;
  token_endpoint?: string;
}

export interface RegisterUserData {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}

export interface ExistingUserData {
  email: string;
}

export interface GenerateTokenData {
  username: string;
  password: string;
}

export interface Token {
  readonly token_type: string;
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly refresh_expires_in: number;
  readonly expires_in?: number;
}

export enum ClientType {
  ADMIN = 'admin',
  PUBLIC = 'public',
}

interface ClientCredentials {
  client_id: string;
  client_secret: string;
  metadata_url: string;
}

@Injectable()
export class KeyCloakService implements OnModuleInit {
  private log: Logger = new Logger(KeyCloakService.name);
  private readonly server_uri: string;
  private readonly realm: string;
  private config: OIDCIdentityConfig;
  private readonly clientAdmin: ClientCredentials;
  private readonly clientPublic: ClientCredentials;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpClient: HttpClientService,
  ) {
    this.server_uri = this.configService.get(
      KeyCloakConfigProperties.ENV_KEYCLOAK_SERVER_URI,
    );
    this.realm = this.configService.get(
      KeyCloakConfigProperties.ENV_KEYCLOAK_REALM,
    );

    const metadata_url = `${this.server_uri}/realms/${this.realm}/.well-known/openid-configuration`;

    this.clientPublic = {
      metadata_url,
      client_id: this.configService.get(
        KeyCloakConfigProperties.ENV_KEYCLOAK_PUBLIC_CLIENT_ID,
      ),
      client_secret: this.configService.get(
        KeyCloakConfigProperties.ENV_KEYCLOAK_PUBLIC_CLIENT_SECRET,
      ),
    };

    this.clientAdmin = {
      metadata_url,
      client_id: this.configService.get(
        KeyCloakConfigProperties.ENV_KEYCLOAK_ADMIN_CLIENT_ID,
      ),
      client_secret: this.configService.get(
        KeyCloakConfigProperties.ENV_KEYCLOAK_ADMIN_CLIENT_SECRET,
      ),
    };
  }

  async onModuleInit(): Promise<void> {
    ok(this.realm, '"realm" is not defined.');
    ok(this.server_uri, '"server_uri" is not defined.');
    ok(this.clientPublic.client_id, 'User "client_id" is not defined.');
    ok(this.clientPublic.client_secret, 'User "client_secret" is not defined.');
    ok(this.clientAdmin.client_id, 'Admin "client_id" is not defined.');
    ok(this.clientAdmin.client_secret, 'Admin "client_secret" is not defined.');

    await this.discovery();
  }

  public async verifyToken(token: string, kid: string) {
    const pems: Map<string, string> = await this.getJWKs();

    if (!pems.has(kid)) {
      throw new UnauthorizedException(
        'Authorization header contains an invalid JWT token.',
      );
    }

    return verify(token, pems.get(kid), {
      issuer: this.config.issuer,
    });
  }

  public async introspectToken(token: string): Promise<Record<string, string>> {
    ok(
      (this.config as OIDCIdentityConfig).introspection_endpoint,
      'Missing "introspection_endpoint"',
    );

    const { access_token, token_type } = await this.generateToken();
    const data = stringify({ token });

    return this.httpClient.post(this.config.introspection_endpoint, data, {
      headers: {
        Authorization: `${token_type} ${access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }

  public async registerUser({
    firstName,
    lastName,
    email,
    password,
  }: RegisterUserData): Promise<User> {
    this.log.debug(`Called registerUser`);

    const { access_token, token_type } = await this.generateToken();

    return this.httpClient.post(
      `${this.server_uri}/admin/realms/${this.realm}/users`,
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
          'Content-Type': 'application/json',
          Authorization: `${token_type} ${access_token}`,
        },
        responseType: 'json',
      },
    );
  }

  public async generateToken(tokenData?: GenerateTokenData): Promise<Token> {
    const tokenPayload = {
      ...this.clientAdmin,
    };

    if (tokenData) {
      Object.assign(tokenPayload, {
        ...tokenData,
        grant_type: 'password',
      });
    } else {
      Object.assign(tokenPayload, {
        grant_type: 'client_credentials',
      });
    }

    return this.httpClient.post<Token>(
      this.config.token_endpoint,
      stringify(tokenPayload),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        responseType: 'json',
      },
    );
  }

  public getClient(clientType: ClientType): ClientCredentials {
    return clientType === ClientType.ADMIN
      ? this.clientAdmin
      : this.clientPublic;
  }

  private async discovery(): Promise<void> {
    let count = 0;

    for (;;) {
      try {
        this.config = (await this.httpClient.loadJSON(
          this.clientAdmin.metadata_url,
        )) as OIDCIdentityConfig;

        return;
      } catch (err) {
        count++;

        if (count >= 10) {
          throw new Error(
            `Cannot discover medata from ${this.clientAdmin.metadata_url}`,
          );
        }

        await promisify(setTimeout)(2 ** count * 120);
      }
    }
  }

  private async getJWKs(): Promise<Map<string, string>> {
    ok((this.config as OIDCIdentityConfig).jwks_uri, 'Missing "jwks_uri"');

    const data = await this.httpClient.loadJSON<{
      keys: (JWK & { kid: string })[];
    }>(this.config.jwks_uri);

    if (!data.keys) {
      throw new InternalServerErrorException(
        'Internal error occurred downloading JWKS data.',
      );
    }

    return new Map<string, string>(
      data.keys.map((key: JWK & { kid: string }) => [key.kid, jwkToPem(key)]),
    );
  }
}
