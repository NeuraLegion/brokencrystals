import { AxiosRequestConfig } from 'axios';
import React, { FC, FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { RoutePath } from '../../../router/RoutePath';
import { getUserData } from '../../../api/httpClient';
import { LoginFormMode, LoginUser, UserData } from '../../../interfaces/User';
import AuthLayout from '../AuthLayout';

const defaultLoginUser: LoginUser = {
  user: '',
  password: '',
  op: LoginFormMode.BASIC
};

export const LoginNew: FC = () => {
  const [form, setForm] = useState<LoginUser>(defaultLoginUser);
  const { user } = form;
  const [errorText, setErrorText] = useState<string | null>();

  const onInput = ({ target }: { target: EventTarget | null }) => {
    const { name, value } = target as HTMLInputElement;
    setForm({ ...form, [name]: value });
  };

  const sendUser = (e: FormEvent) => {
    e.preventDefault();
    const config: Pick<AxiosRequestConfig, 'headers'> = {
      headers: { 'content-type': 'application/x-www-form-urlencoded' }
    };

    getUserData(form.user, config)
      .then((data: UserData) => data)
      .then(({ email }) => {
        if (!email) {
          setErrorText('User doesn`t exist, try to signup');
        } else {
          sessionStorage.setItem('email', email);
          window.location.href = RoutePath.PasswordCheck;
        }
      });
  };

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
          <button
            className="au-btn au-btn--block au-btn--green m-b-20"
            type="submit"
          >
            Enter password
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

export default LoginNew;
