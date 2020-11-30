import React, { FC } from "react";
import logoBlue from "../../img/logo_blue.png";

export const Login: FC = () => {
  return (
    <div className="container">
      <form method="post">
        <a href="/" className="logo mr-auto">
          <img
            width={100}
            height={100}
            src={logoBlue}
            alt=""
            className="img-fluid"
          />
          BROKEN CRYSTALS
        </a>
        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            type="text"
            className="form-control"
            id="username"
            name="username"
            aria-describedby="emailHelp"
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            className="form-control"
            id="password"
            name="password"
          />
        </div>
        <div className="form-group form-check">
          <input type="checkbox" className="form-check-input" id="remember" />
          <label className="form-check-label" htmlFor="remember">
            Remember Me
          </label>
          <label>
            <a href="/forgotten">
              <br />
              Forgotten password?
            </a>
          </label>
        </div>
        <button type="submit" className="btn btn-primary">
          Login
        </button>
        <div className="form-group form-check">
          <label>
            Haven't joined us yet?
            <a href="/register">
              <br />
              Sign Up Here
            </a>
          </label>
        </div>
      </form>
    </div>
  );
};

export default Login;
