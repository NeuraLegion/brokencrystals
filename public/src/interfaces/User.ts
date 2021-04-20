export enum AuthType {
  FORM = 'form',
  OIDC = 'OIDC',
  NTLM = 'NTLM'
}

export interface LoginUser {
  user: string;
  password: string;
  op?: AuthType;
  csrf?: string;
}

export interface LoginResponse {
  email: string;
  ldapProfileLink: string;
}

export interface RegistrationUser {
  email: string;
  lastName: string;
  firstName: string;
  password?: string;
}
