import { AxiosRequestConfig } from 'axios';
import React, { FC, FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLdap, getUser, loadXsrfToken } from '../../../api/httpClient';
import {
  AuthType,
  LoginResponse,
  LoginUser,
  RegistrationUser
} from '../../../interfaces/User';
import AuthLayout from '../AuthLayout';
import showLdapResponse from './showLdapReponse';
import showLoginResponse from './showLoginReponse';

const defaultLoginUser: LoginUser = {
  user: '',
  password: '',
  op: AuthType.APPLICATION_JSON
};

enum FormMode {
  BASIC = 'basic',
  HTML = 'html',
  CSRF = 'csrf'
}

export const Login: FC = () => {
  const [form, setForm] = useState<LoginUser>(defaultLoginUser);
  const { user, password } = form;

  const [loginResponse, setLoginResponse] = useState<LoginResponse | null>();
  const [ldapResponse, setLdapResponse] = useState<Array<RegistrationUser>>([]);

  const [mode, setMode] = useState<FormMode>(FormMode.BASIC);
  const [csrf, setCsrf] = useState<string>();

  const onInput = ({ target }: { target: EventTarget | null }) => {
    const { name, value } = target as HTMLInputElement;
    setForm({ ...form, [name]: value });
  };

  const onSelectMode = ({ target }: { target: EventTarget | null }) => {
    const { value } = target as HTMLSelectElement & { value: FormMode };
    setMode(value);
    switch (value as FormMode) {
      case FormMode.HTML:
        setForm({ ...form, op: AuthType.FORM_BASED });
        break;
      default:
        return;
    }
  };

  const sendUser = (e: FormEvent) => {
    e.preventDefault();
    const config: Pick<AxiosRequestConfig, 'headers'> =
      form.op === AuthType.FORM_BASED
        ? { headers: { 'content-type': AuthType.FORM_BASED } }
        : {};
    const params = appendParams(form);

    getUser(params, config)
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

  const appendParams = (data: LoginUser): LoginUser => {
    switch (mode) {
      case FormMode.CSRF:
        return { ...data, csrf };
      default:
        return data;
    }
  };

  const loadCsrf = () => {
    loadXsrfToken().then((token) => setCsrf(token));
  };

  useEffect(() => sendLdap(), [loginResponse]);
  useEffect(() => {
    switch (mode) {
      case FormMode.CSRF: {
        return loadCsrf();
      }
    }
  }, [mode]);

  return (
    <AuthLayout>
      <div className="login-form">
        <form onSubmit={sendUser}>
          <div className="form-group">
            <label>Authentication Type</label>
            <select
              className="form-control"
              name="op"
              placeholder="Authentication Type"
              value={mode}
              onChange={onSelectMode}
            >
              <option value={FormMode.BASIC}>
                Simple REST-based Authentication
              </option>
              <option value={FormMode.HTML}>
                Simple HTML Form-based Authentication
              </option>
              <option value={FormMode.CSRF}>
                Simple CSRF-based Authentication
              </option>
            </select>
          </div>

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
          {mode === FormMode.CSRF && csrf && (
            <input name="xsrf" type="hidden" value={csrf} />
          )}

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
