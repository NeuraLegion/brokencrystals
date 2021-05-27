export enum OidcClientType {
  ADMIN = 'admin',
  PUBLIC = 'public'
}

export interface OidcClient {
  clientId: string;
  clientSecret?: string;
}
