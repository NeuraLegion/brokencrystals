import React, { FC } from "react";
import logoBlue from "../../img/logo_blue.png";

export const Forgotten: FC = () => {
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
          <label htmlFor="email">Email</label>
          <input
            type="email"
            className="form-control"
            id="email"
            name="email"
            aria-describedby="emailHelp"
          />
          <small id="emailHelp" className="form-text text-muted">
            Enter your email to receive a password reset link.
          </small>
        </div>
        <button type="submit" className="btn btn-danger">
          Reset
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

export default Forgotten;
