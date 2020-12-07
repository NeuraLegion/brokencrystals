export interface LoginUser {
  user: string;
  password: string;
}

export interface LoginUserResponse {
  email: string;
  ldapProfileLink: string;
}

export interface RegistrationUser {
  email: string;
  lastName: string;
  firstName: string;
  password: string;
}
