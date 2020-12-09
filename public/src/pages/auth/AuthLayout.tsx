import React, { FC } from 'react';
import { Link } from 'react-router-dom';

export const AuthLayout: FC = ({ children }) => {
  return (
    <div className="page-content--bge5">
      <div className="container">
        <div className="login-wrap">
          <div className="login-content">
            <div className="login-logo">
              <Link to="/" className="logo mr-auto">
                <img
                  width={100}
                  height={100}
                  src="assets/img/logo_blue.png"
                  alt=""
                  className="img-fluid"
                />
                BROKEN CRYSTALS
              </Link>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
