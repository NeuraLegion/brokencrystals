import React, { FC, FormEvent, useState } from 'react';
import { postUser } from '../../api/httpClient';
import { RegistrationUser } from '../../interfaces/User';

const defaultUser: RegistrationUser = {
  email: '',
  lastName: '',
  firstName: '',
  password: '',
};

export const Register: FC = () => {
  const [user, setUser] = useState<RegistrationUser>(defaultUser);
  const [response, setResponse] = useState<RegistrationUser>(defaultUser);

  const sendUser = (e: FormEvent) => {
    e.preventDefault();

    postUser(user)
      .then((data) => {
        setResponse(data);
      })
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
                  <label>First name</label>
                  <input
                    className="au-input au-input--full"
                    type="text"
                    name="first_name"
                    placeholder="First name"
                    value={user.firstName}
                    onInput={(e) =>
                      setUser({ ...user, firstName: e.currentTarget.value })
                    }
                  />
                  <span
                    className="dangerouslySetInnerHTML"
                    dangerouslySetInnerHTML={{ __html: response.firstName }}
                  />
                </div>
                <div className="form-group">
                  <label>Last name</label>
                  <input
                    className="au-input au-input--full"
                    type="text"
                    name="last_name"
                    placeholder="Last name"
                    value={user.lastName}
                    onInput={(e) =>
                      setUser({ ...user, lastName: e.currentTarget.value })
                    }
                  />
                  <span
                    className="dangerouslySetInnerHTML"
                    dangerouslySetInnerHTML={{ __html: response.lastName }}
                  />
                </div>
                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    className="au-input au-input--full"
                    type="email"
                    name="email"
                    placeholder="Email"
                    value={user.email}
                    onInput={(e) =>
                      setUser({ ...user, email: e.currentTarget.value })
                    }
                  />
                  <span
                    className="dangerouslySetInnerHTML"
                    dangerouslySetInnerHTML={{ __html: response.email }}
                  />
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
                <button
                  className="au-btn au-btn--block au-btn--green m-b-20"
                  type="submit"
                >
                  register
                </button>
              </form>
              <div className="register-link">
                <p>
                  Already have an account? <a href="/login">Sign In</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
