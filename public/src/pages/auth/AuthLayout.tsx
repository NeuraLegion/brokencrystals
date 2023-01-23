import React from 'react';

type Props = {
  children?: React.ReactNode;
  logoUrl?: string;
};

export const AuthLayout = ({ children, logoUrl }: Props) => {
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
                  src={logoUrl || 'assets/img/logo_blue.png'}
                  alt=""
                  className="img-fluid"
                />
                BROKEN CRYSTALS
              </a>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
