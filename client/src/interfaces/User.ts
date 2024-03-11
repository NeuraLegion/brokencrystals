export interface LoginUser {
  user: string;
  password: string;
  csrf?: string;
  op?: LoginFormMode;
  fingerprint?: string;
  rememberuser?: string;
}

export enum LoginFormMode {
  BASIC = 'basic',
  HTML = 'html',
  CSRF = 'csrf',
  DOM_BASED_CSRF = 'csrf_dom',
  OIDC = 'oidc'
}

export interface LoginResponse {
  email: string;
  ldapProfileLink: string;
  errorText: string | null;
}

export interface RegistrationUser {
  email: string;
  lastName: string;
  firstName: string;
  company: string;
  cardNumber: string;
  phoneNumber: string;
  password?: string;
  op?: LoginFormMode;
}

export interface UserData {
  email: string;
  lastName: string;
  firstName: string;
  isAdmin?: boolean;
  id: string;
  company: string;
}
