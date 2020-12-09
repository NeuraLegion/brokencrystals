export interface LoginUser {
  user: string;
  password: string;
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
