export interface LoginUser {
  user: string;
  password: string;
  csrf?: string;
  op?: LoginFormMode;
}

export enum LoginFormMode {
  BASIC = 'basic',
  HTML = 'html',
  CSRF = 'csrf'
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
