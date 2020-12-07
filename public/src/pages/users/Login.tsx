import React, { FC, FormEvent, useState } from 'react';
import {
  LoginUser,
  LoginUserResponse,
  RegistrationUser,
} from '../../interfaces/User';
import { getLdap, getUser } from '../../api/httpClient';

const defaultLoginUser: LoginUser = {
  user: '',
  password: '',
};

const defaultUserResponse: LoginUserResponse = {
  email: '',
  ldapProfileLink: '',
};

const defaultRegistrationUser: RegistrationUser = {
  email: '',
  lastName: '',
  firstName: '',
  password: '',
};

export const Login: FC = () => {
  const [user, setUser] = useState<LoginUser>(defaultLoginUser);
  const [userResponse, setUserResponse] = useState<LoginUserResponse>(
    defaultUserResponse,
  );
  const [ldapResponse, setLdapResponse] = useState<RegistrationUser>(
    defaultRegistrationUser,
  );

  const sendUser = async (e: FormEvent) => {
    e.preventDefault();

    getUser(user)
      .then((data: LoginUserResponse) => {
        setUserResponse(data);
        return data.ldapProfileLink;
      })
      .then((ldapProfileLink) =>
        getLdap(ldapProfileLink).then((data) => setLdapResponse(data)),
      )
      .catch((response) => {
        console.log('error', response);
      });
  };

  return (
    <div className="page-content--bge5">
      <div className="container">
        <div className="login-wrap">
          <div className="login-content">
            <div className="login-logo">
              <a href="/" className="logo mr-auto">
                <img
                  width={100}
                  height={100}
                  src="assets/img/logo_blue.png"
                  alt=""
                  className="img-fluid"
                />
                BROKEN CRYSTALS
              </a>
            </div>
            <div className="login-form">
              <form onSubmit={sendUser}>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    className="au-input au-input--full"
                    type="email"
                    name="email"
                    placeholder="Email"
                    value={user.user}
                    onInput={(e) =>
                      setUser({ ...user, user: e.currentTarget.value })
                    }
                  />
                  {userResponse.email && (
                    <div
                      className="dangerouslySetInnerHTML"
                      dangerouslySetInnerHTML={{
                        __html: 'Email: ' + userResponse.email,
                      }}
                    />
                  )}
                  {userResponse.ldapProfileLink && (
                    <div
                      className="dangerouslySetInnerHTML"
                      dangerouslySetInnerHTML={{
                        __html: 'LDAP: ' + userResponse.ldapProfileLink,
                      }}
                    />
                  )}
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input
                    className="au-input au-input--full"
                    type="password"
                    name="password"
                    placeholder="Password"
                    value={user.password}
                    onInput={(e) =>
                      setUser({ ...user, password: e.currentTarget.value })
                    }
                  />
                </div>
                {ldapResponse.email && (
                  <div
                    className="dangerouslySetInnerHTML"
                    dangerouslySetInnerHTML={{
                      __html: 'Email: ' + ldapResponse.email,
                    }}
                  />
                )}
                {ldapResponse.firstName && (
                  <div
                    className="dangerouslySetInnerHTML"
                    dangerouslySetInnerHTML={{
                      __html: 'First Name: ' + ldapResponse.firstName,
                    }}
                  />
                )}
                {ldapResponse.lastName && (
                  <div
                    className="dangerouslySetInnerHTML"
                    dangerouslySetInnerHTML={{
                      __html: 'Last Name: ' + ldapResponse.lastName,
                    }}
                  />
                )}
                <button
                  className="au-btn au-btn--block au-btn--green m-b-20"
                  type="submit"
                >
                  sign in
                </button>
              </form>
              <div className="register-link">
                <p>
                  Don't you have account? <a href="/register">Sign Up Here</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
