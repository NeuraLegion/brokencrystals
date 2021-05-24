import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ok } from 'assert';
import { HttpClientService } from '../httpclient/httpclient.service';
import { KeyCloakConfigProperties } from './keycloak.config.properties';
import jwkToPem, { JWK } from 'jwk-to-pem';
import { stringify } from 'qs';
import {
  Secret,
  GetPublicKeyOrSecret,
  verify,
  VerifyOptions,
} from 'jsonwebtoken';

export interface OIDCIdentityOptions {
  issuer: string;
  introspection_endpoint: string;
  jwks_uri: string;
  token_endpoint: string;
}

@Injectable()
export class KeyCloakService {
  private readonly metadata_uri: string;
  private readonly client_id: string;
  private readonly client_secret: string;
  private options: OIDCIdentityOptions;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpClient: HttpClientService,
  ) {
    this.metadata_uri = this.configService.get(
      KeyCloakConfigProperties.ENV_KEYCLOAK_METADATA_URI,
    );
    this.client_id = this.configService.get(
      KeyCloakConfigProperties.ENV_KEYCLOAK_CLIENT_ID,
    );
    this.client_secret = this.configService.get(
      KeyCloakConfigProperties.ENV_KEYCLOAK_CLIENT_SECRET,
    );
  }

  public async init(): Promise<void> {
    ok(this.client_id, '"client_id" is not defined.');
    ok(this.client_secret, '"client_secret" is not defined.');
    ok(this.metadata_uri, '"metadata_uri" is not defined.');

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
      issuer: this.options.issuer,
    });
  }

  public async introspectToken(token: string): Promise<Record<string, string>> {
    ok(
      (this.options as OIDCIdentityOptions).introspection_endpoint,
      'Missing "introspection_endpoint"',
    );

    // const { accessToken, tokenType } = await this.getAccessToken(
    //   this.userName,
    //   this.userSecret,
    // );
    const data = stringify({ token });

    return this.httpClient.post(this.options.introspection_endpoint, data, {
      headers: {
        // Authorization: `${tokenType} ${accessToken}`,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }

  public async registerUser(): Promise<void> {}

  private async discovery(): Promise<void> {
    this.options = (await this.httpClient.loadJSON(
      this.metadata_uri,
    )) as OIDCIdentityOptions;
  }

  private async getJWKs(): Promise<Map<string, string>> {
    ok((this.options as OIDCIdentityOptions).jwks_uri, 'Missing "jwks_uri"');

    const data = await this.httpClient.loadJSON<{
      keys: (JWK & { kid: string })[];
    }>(this.options.jwks_uri);

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
