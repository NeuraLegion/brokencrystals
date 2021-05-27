import React, { FC, FormEvent, useEffect, useState } from 'react';
import { getOidcClient, postUser } from '../../../api/httpClient';
import { RegistrationUser } from '../../../interfaces/User';
import AuthLayout from '../AuthLayout';
import { Link } from 'react-router-dom';
import showRegResponse from './showRegReponse';
import { OidcClient, OidcClientType } from 'src/interfaces/Auth';

const defaultUser: RegistrationUser = {
  email: '',
  firstName: '',
  lastName: '',
  password: ''
};

export const Register: FC = () => {
  const [form, setForm] = useState<RegistrationUser>(defaultUser);
  const { email, firstName, lastName, password } = form;

  const [regResponse, setRegResponse] = useState<RegistrationUser | null>();
  const [oidcClient, setOidcClient] = useState<OidcClient>();

  const onInput = ({ target }: { target: EventTarget | null }) => {
    const { name, value } = target as HTMLInputElement;
    setForm({ ...form, [name]: value });
  };

  const sendUser = (e: FormEvent) => {
    e.preventDefault();

    postUser(form).then((data) => setRegResponse(data));
  };

  const loadOidcClient = (type: OidcClientType) => {
    getOidcClient(type).then((client) => setOidcClient(client));
  };

  useEffect(() => loadOidcClient(OidcClientType.ADMIN));

  return (
    <AuthLayout>
      <div className="login-form">
        <form onSubmit={sendUser}>
          <div className="form-group">
            <label>First name</label>
            <input
              className="au-input au-input--full"
              type="text"
              name="firstName"
              placeholder="First name"
              value={firstName}
              onInput={onInput}
            />
          </div>

          {oidcClient && (
            <div>
              <p>
                <b>clientId:</b> {oidcClient.clientId}
              </p>
              <p>
                <b>clientSecret:</b> {oidcClient.clientSecret}
              </p>
              <br />
            </div>
          )}

          <div className="form-group">
            <label>Last name</label>
            <input
              className="au-input au-input--full"
              type="text"
              name="lastName"
              placeholder="Last name"
              value={lastName}
              onInput={onInput}
            />
          </div>

          <div className="form-group">
            <label>Email Address</label>
            <input
              className="au-input au-input--full"
              type="text"
              name="email"
              placeholder="Email"
              value={email}
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

          {regResponse && showRegResponse(regResponse)}

          <button
            className="au-btn au-btn--block au-btn--green m-b-20"
            type="submit"
          >
            register
          </button>
        </form>

        <div className="register-link">
          <p>
            Already have an account? <Link to="/login">Sign In</Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Register;
