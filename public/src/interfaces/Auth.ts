export enum OidcClientType {
  ADMIN = 'admin',
  USER = 'user'
}

export interface OidcClient {
  clientId: string;
  clientSecret?: string;
}
