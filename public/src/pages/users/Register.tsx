import React, { FC } from "react";
import logoBlue from "../../img/logo_blue.png";

export const Register: FC = () => {
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
          <label htmlFor="first_name">First name</label>
          <input
            type="text"
            className="form-control"
            id="first_name"
            name="first_name"
          />
        </div>
        <div className="form-group">
          <label htmlFor="last_name">Last name</label>
          <input
            type="text"
            className="form-control"
            id="last_name"
            name="last_name"
          />
        </div>
        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            type="text"
            className="form-control"
            id="username"
            name="username"
          />
        </div>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            className="form-control"
            id="email"
            name="email"
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            className="form-control"
            id="password"
            name="password"
            aria-describedby="help"
          />
          <small id="help" className="form-text text-muted">
            We'll never share your credentials with anyone else.
          </small>
        </div>
        <div className="form-group form-check">
          <input
            type="checkbox"
            className="form-check-input"
            id="agree"
            required
          />
          <label className="form-check-label" htmlFor="agree">
            I Agree to the Terms and Conditions
          </label>
        </div>
        <button type="submit" className="btn btn-primary">
          Register
        </button>
        <div className="form-group form-check">
          <label>
            Already joined us?
            <a href="/login">
              <br />
              Sign In Here
            </a>
          </label>
        </div>
      </form>
    </div>
  );
};

export default Register;
