import React, { useRef, useEffect, FC } from 'react';

type Props = {
  children?: React.ReactNode;
  logoBgColor?: string;
};

export const AuthLayout: FC<Props> = ({ children, logoBgColor }: Props) => {
  const logoRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (logoRef.current) {
      logoRef.current.style.cssText = `background-color: ${logoBgColor}`;
    }
  });
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
                  alt="logo"
                  className="img-fluid"
                  ref={logoRef}
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
