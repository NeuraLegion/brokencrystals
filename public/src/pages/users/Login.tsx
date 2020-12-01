import React, { FC } from 'react';

export const Login: FC = () => {
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
              <form action="" method="post">
                <div className="form-group">
                  <label>Username</label>
                  <input
                    className="au-input au-input--full"
                    type="text"
                    name="username"
                    placeholder="Username"
                  />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input
                    className="au-input au-input--full"
                    type="password"
                    name="password"
                    placeholder="Password"
                  />
                </div>
                <div className="login-checkbox">
                  <label>
                    <input type="checkbox" name="remember" />
                    Remember Me
                  </label>
                  <label>
                    <a href="/forgotten">Forgotten Password?</a>
                  </label>
                </div>
                <button
                  className="au-btn au-btn--block au-btn--green m-b-20"
                  type="submit"
                >
                  sign in
                </button>
              </form>
              <div className="register-link">
                <p>
                  Don't you have account?
                  <a href="/register">Sign Up Here</a>
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
