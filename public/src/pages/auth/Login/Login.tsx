import { AxiosRequestConfig } from 'axios';
import getBrowserFingerprint from 'get-browser-fingerprint';
import React, { FC, FormEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { OidcClient } from '../../../interfaces/Auth';
import { RoutePath } from '../../../router/RoutePath';
import {
  getLdap,
  getUser,
  getUserData,
  loadXsrfToken,
  loadDomXsrfToken,
  getOidcClient
} from '../../../api/httpClient';
import {
  LoginFormMode,
  LoginResponse,
  LoginUser,
  UserData,
  RegistrationUser
} from '../../../interfaces/User';
import AuthLayout from '../AuthLayout';
import showLdapResponse from './showLdapReponse';
import showLoginResponse from './showLoginReponse';

const defaultLoginUser: LoginUser = {
  user: '',
  password: '',
  op: LoginFormMode.BASIC
};

enum RequestHeaders {
  FORM_URLENCODED = 'application/x-www-form-urlencoded',
  APPLICATION_JSON = 'application/json'
}

interface stateType {
  from: string;
}

export const Login: FC = () => {
  const { state } = useLocation<stateType>();

  const [form, setForm] = useState<LoginUser>(defaultLoginUser);
  const { user, password } = form;

  const [loginResponse, setLoginResponse] = useState<LoginResponse | null>();
  const [ldapResponse, setLdapResponse] = useState<Array<RegistrationUser>>([]);
  const [errorText, setErrorText] = useState<string | null>();

  const [mode, setMode] = useState<LoginFormMode>(LoginFormMode.BASIC);
  const [csrf, setCsrf] = useState<string>();
  const [oidcClient, setOidcClient] = useState<OidcClient>();

  const onInput = ({ target }: { target: EventTarget | null }) => {
    const { name, value } = target as HTMLInputElement;
    setForm({ ...form, [name]: value });
  };

  const onSelectMode = ({ target }: { target: EventTarget | null }) => {
    const { value } = target as HTMLSelectElement & { value: LoginFormMode };
    setForm({ ...form, op: value });
    setMode(value);
  };

  const sendUser = (e: FormEvent) => {
    e.preventDefault();
    const config: Pick<AxiosRequestConfig, 'headers'> =
      mode === LoginFormMode.HTML
        ? { headers: { 'content-type': RequestHeaders.FORM_URLENCODED } }
        : {};
    const params = appendParams(form);

    getUser(params, config)
      .then((data: LoginResponse) => {
        setLoginResponse(data);
        return data;
      })
      .then(({ email, errorText }) => {
        if (errorText) {
          setErrorText(errorText);
        }
        sessionStorage.setItem('email', email);
        return getUserData(email);
      })
      .then((userData: UserData) =>
        sessionStorage.setItem(
          'userName',
          `${userData.firstName} ${userData.lastName}`
        )
      );
  };

  const sendLdap = () => {
    const { ldapProfileLink } = loginResponse || {};
    ldapProfileLink &&
      getLdap(ldapProfileLink)
        .then((data) => setLdapResponse(data))
        .then(() => {
          window.location.href = state ? state.from : '/';
        });
  };

  const appendParams = (data: LoginUser): LoginUser => {
    switch (mode) {
      case LoginFormMode.CSRF:
        return { ...data, csrf };
      case LoginFormMode.DOM_BASED_CSRF:
        const fingerprint = getBrowserFingerprint();
        return { ...data, csrf, fingerprint };
      default:
        return data;
    }
  };

  const loadCsrf = () => {
    loadXsrfToken().then((token) => setCsrf(token));
  };

  const loadDomCsrf = (fingerprint: string) => {
    loadDomXsrfToken(fingerprint).then((token) => setCsrf(token));
  };
  const loadOidcClient = () => {
    getOidcClient().then((client) => setOidcClient(client));
  };

  const extractLogoBgColor = (): string | null => {
    const { searchParams } = new URL(window.location.href);
    return searchParams.get('logobgcolor');
  };

  useEffect(() => sendLdap(), [loginResponse]);
  useEffect(() => {
    switch (mode) {
      case LoginFormMode.CSRF:
        return loadCsrf();
      case LoginFormMode.DOM_BASED_CSRF:
        return loadDomCsrf(getBrowserFingerprint());
      case LoginFormMode.OIDC:
        return loadOidcClient();
    }
  }, [mode]);

  return (
    <AuthLayout logoBgColor={extractLogoBgColor() || 'transparent'}>
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
              <option value={LoginFormMode.BASIC}>
                Simple REST-based Authentication
              </option>
              <option value={LoginFormMode.HTML}>
                Simple HTML Form-based Authentication
              </option>
              <option value={LoginFormMode.CSRF}>
                Simple CSRF-based Authentication
              </option>
              <option value={LoginFormMode.DOM_BASED_CSRF}>
                DOM based CSRF Authentication
              </option>
              <option value={LoginFormMode.OIDC}>
                Simple OIDC-based Authentication
              </option>
            </select>
          </div>

          {oidcClient && (
            <div>
              <p>
                <b>client_id:</b> {oidcClient.clientId}
              </p>
              <p>
                <b>client_secret:</b> {oidcClient.clientSecret}
              </p>
              <p>
                <b>Openid-configuration URL:</b> {oidcClient.metadataUrl}
              </p>
              <br />
            </div>
          )}

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

          {(mode === LoginFormMode.CSRF ||
            mode === LoginFormMode.DOM_BASED_CSRF) &&
            csrf && <input name="xsrf" type="hidden" value={csrf} />}

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
        <div>
          {errorText && <div className="error-text">{errorText}</div>}
          <b>Hint</b>: if you are looking for an authentication protected
          endpoint, try using:
          <a href="https://brokencrystals.com/api/products">
            https://brokencrystals.com/api/products
          </a>
        </div>
        <div className="register-link">
          <p>
            Don't have an account?{' '}
            <Link to={RoutePath.Register}>Sign Up Here</Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Login;
