import { AxiosRequestConfig } from 'axios';
import React, { FC, FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RoutePath } from '../../../router/RoutePath';
import { getUser, getUserData } from '../../../api/httpClient';
import {
  LoginFormMode,
  LoginResponse,
  LoginUser,
  UserData
} from '../../../interfaces/User';
import AuthLayout from '../AuthLayout';

const defaultLoginUser: LoginUser = {
  user: '',
  password: '',
  op: LoginFormMode.BASIC
};

export const PasswordCheck: FC = () => {
  const [form, setForm] = useState<LoginUser>(defaultLoginUser);
  const { password } = form;

  const [errorText, setErrorText] = useState<string | null>();

  const email = sessionStorage.getItem('email');

  const onInput = ({ target }: { target: EventTarget | null }) => {
    const { name, value } = target as HTMLInputElement;
    setForm({ ...form, [name]: value });
  };

  const sendUser = (e: FormEvent) => {
    e.preventDefault();
    const config: Pick<AxiosRequestConfig, 'headers'> = {
      headers: { 'content-type': 'application/json' }
    };

    getUser(form, config)
      .then((data: LoginResponse) => {
        return data;
      })
      .then(({ email, errorText }) => {
        if (errorText) {
          setErrorText(errorText);
        } else {
          if (form.rememberuser) {
            localStorage.setItem(
              'email',
              sessionStorage.getItem('email') || ''
            );
            localStorage.setItem(
              'token',
              sessionStorage.getItem('token') || ''
            );
            sessionStorage.clear();
          }
        }
        return getUserData(email);
      })
      .then((userData: UserData) => {
        if (form.rememberuser) {
          localStorage.setItem(
            'userName',
            `${userData.firstName} ${userData.lastName}`
          );
        } else {
          sessionStorage.setItem(
            'userName',
            `${userData.firstName} ${userData.lastName}`
          );
        }
        window.location.href = RoutePath.Home;
      });
  };

  useEffect(() => {
    if (email) {
      setForm({ ...form, user: email });
    }
  }, []);

  return (
    <AuthLayout>
      <div className="login-form">
        <form onSubmit={sendUser}>
          <div className="form-group">
            <label>Username:</label>
            <input value={form.user} name="user" readOnly />
            <label>Enter Password:</label>
            <input
              className="au-input au-input--full"
              type="password"
              name="password"
              placeholder="Password"
              value={password}
              onInput={onInput}
            />
            <label htmlFor="rememberuser">
              <input
                type="checkbox"
                id="rememberuser"
                name="rememberuser"
                value="true"
                onChange={onInput}
              />
              &nbsp;Remember me
            </label>
          </div>
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

export default PasswordCheck;
