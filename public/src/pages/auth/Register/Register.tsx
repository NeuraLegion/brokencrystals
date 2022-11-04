import React, { FC, FormEvent, useState } from 'react';
import { postUser } from '../../../api/httpClient';
import { RegistrationUser, LoginFormMode } from '../../../interfaces/User';
import AuthLayout from '../AuthLayout';
import { Link } from 'react-router-dom';
import showRegResponse from './showRegReponse';
import { RoutePath } from '../../../router/RoutePath';

const defaultUser: RegistrationUser = {
  email: '',
  firstName: '',
  lastName: '',
  company: '',
  cardNumber: '',
  phoneNumber: '',
  password: '',
  op: LoginFormMode.BASIC
};

export const Register: FC = () => {
  const [form, setForm] = useState<RegistrationUser>(defaultUser);
  const {
    email,
    firstName,
    lastName,
    password,
    company,
    cardNumber,
    phoneNumber
  } = form;

  const [regResponse, setRegResponse] = useState<RegistrationUser | null>();
  const [errorText, setErrorText] = useState<string | null>();

  const [authMode, setAuthMode] = useState<LoginFormMode>(LoginFormMode.BASIC);

  const [submitBtnDisabled, setSubmitBtnDisabled] = useState<boolean>(false);

  const onInput = ({ target }: { target: EventTarget | null }) => {
    const { name, value } = target as HTMLInputElement;
    setForm({ ...form, [name]: value });
  };

  const onAuthModeChange = ({ target }: { target: EventTarget | null }) => {
    const { value } = target as HTMLSelectElement & { value: LoginFormMode };
    setForm({ ...form, op: value });
    setAuthMode(value);
  };

  const sendUser = (e: FormEvent) => {
    e.preventDefault();
    console.log('click');
    setSubmitBtnDisabled(true);
    postUser(form).then((data) => {
      if (data.errorText) {
        setErrorText(data.errorText);
        setSubmitBtnDisabled(false);
      } else {
        setRegResponse(data);
        setTimeout(() => {
          window.location.href = RoutePath.Login;
        }, 1500);
      }
    });
  };

  return (
    <AuthLayout>
      <div className="login-form">
        <form onSubmit={sendUser}>
          <div className="form-group">
            <label>Registration Type</label>
            <select
              className="form-control"
              name="op"
              placeholder="Authentication Type"
              value={authMode}
              onChange={onAuthModeChange}
            >
              <option value={LoginFormMode.BASIC}>
                Simple REST-based Registration
              </option>
              <option value={LoginFormMode.OIDC}>
                Simple OIDC-based Registration
              </option>
            </select>
          </div>
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
            <label>Company</label>
            <input
              className="au-input au-input--full"
              type="text"
              name="company"
              placeholder="Company"
              value={company}
              onInput={onInput}
            />
          </div>

          <div className="form-group">
            <label>Card number</label>
            <input
              className="au-input au-input--full"
              type="text"
              name="cardNumber"
              placeholder="Card number"
              value={cardNumber}
              onInput={onInput}
            />
          </div>

          <div className="form-group">
            <label>Phone number</label>
            <input
              className="au-input au-input--full"
              type="text"
              name="phoneNumber"
              placeholder="Phone number"
              value={phoneNumber}
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
          {errorText && <div className="error-text">{errorText}</div>}
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
            disabled={submitBtnDisabled}
          >
            register
          </button>
        </form>

        <div className="register-link">
          <p>
            Already have an account? <Link to={RoutePath.Login}>Sign In</Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Register;
