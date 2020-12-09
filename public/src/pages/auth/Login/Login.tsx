import React, { FC, FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LoginUser,
  LoginResponse,
  RegistrationUser
} from '../../../interfaces/User';
import { getLdap, getUser } from '../../../api/httpClient';
import AuthLayout from '../AuthLayout';
import showLoginResponse from './showLoginReponse';
import showLdapResponse from './showLdapReponse';

const defaultLoginUser: LoginUser = {
  user: '',
  password: ''
};

export const Login: FC = () => {
  const [form, setForm] = useState<LoginUser>(defaultLoginUser);
  const { user, password } = form;

  const [loginResponse, setLoginResponse] = useState<LoginResponse | null>();
  const [ldapResponse, setLdapResponse] = useState<Array<RegistrationUser>>([]);

  const onInput = ({ target }: { target: EventTarget | null }) => {
    const { name, value } = target as HTMLInputElement;
    setForm({ ...form, [name]: value });
  };

  const sendUser = (e: FormEvent) => {
    e.preventDefault();

    getUser(form)
      .then((data: LoginResponse) => {
        setLoginResponse(data);
        return data.email;
      })
      .then((email) => sessionStorage.setItem('email', email));
  };

  const sendLdap = () => {
    const { ldapProfileLink } = loginResponse || {};
    ldapProfileLink &&
      getLdap(ldapProfileLink)
        .then((data) => setLdapResponse(data))
        .then(() => {
          window.location.href = '/';
        });
  };

  useEffect(() => sendLdap(), [loginResponse]);

  return (
    <AuthLayout>
      <div className="login-form">
        <form onSubmit={sendUser}>
          <div className="form-group">
            <label>Email</label>
            <input
              className="au-input au-input--full"
              type="text"
              name="user"
              placeholder="Email"
              value={user}
              onInput={onInput}
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              className="au-input au-input--full"
              type="password"
              name="password"
              placeholder="Password"
              value={password}
              onInput={onInput}
            />
          </div>

          {loginResponse && showLoginResponse(loginResponse)}
          <br />
          {ldapResponse && showLdapResponse(ldapResponse)}

          <button
            className="au-btn au-btn--block au-btn--green m-b-20"
            type="submit"
          >
            sign in
          </button>
        </form>

        <div className="register-link">
          <p>
            Don't you have account? <Link to="/register">Sign Up Here</Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Login;
