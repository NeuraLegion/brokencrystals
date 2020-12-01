import React, { FC } from 'react';

export const Forgotten: FC = () => {
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
                  <label>Email Address</label>
                  <input
                    className="au-input au-input--full"
                    type="email"
                    name="email"
                    placeholder="Email"
                  />
                </div>
                <button
                  className="au-btn au-btn--block au-btn--green m-b-20"
                  type="submit"
                >
                  submit
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Forgotten;
