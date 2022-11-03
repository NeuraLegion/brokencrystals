import React, { FormEvent, useEffect, useState } from 'react';
import { Redirect } from 'react-router';
import { getUserData, putUserData } from '../../api/httpClient';
import { UserData } from '../../interfaces/User';
import { RoutePath } from '../../router/RoutePath';
import AuthLayout from '../auth/AuthLayout';

const defaultUserData: UserData = {
  email: '',
  firstName: '',
  lastName: '',
  id: '',
  company: ''
};

export const Userprofile = () => {
  const email: string | null =
    sessionStorage.getItem('email') || localStorage.getItem('email');
  const [user, setUser] = useState<UserData>(defaultUserData);

  const onInput = ({ target }: { target: EventTarget | null }) => {
    const { name, value } = target as HTMLInputElement;
    setUser({ ...user, [name]: value });
  };

  useEffect(() => {
    if (email) {
      getUserData(email).then((data) => setUser(data));
    }
  }, []);

  const sendUserData = (e: FormEvent) => {
    e.preventDefault();
    putUserData(user).then(() => {
      if (localStorage.getItem('email')) {
        localStorage.setItem('userName', `${user.firstName} ${user.lastName}`);
      } else {
        sessionStorage.setItem(
          'userName',
          `${user.firstName} ${user.lastName}`
        );
      }
      window.location.href = RoutePath.Home;
    });
  };

  return (
    <>
      {email ? (
        <AuthLayout>
          <div className="login-form">
            <form onSubmit={sendUserData}>
              <div className="form-group">
                <label>Email</label>
                <input
                  className="au-input au-input--full"
                  type="text"
                  name="email"
                  placeholder="Email"
                  value={user.email}
                  onInput={onInput}
                />
              </div>
              <div className="form-group">
                <label>FirstName</label>
                <input
                  className="au-input au-input--full"
                  type="text"
                  name="firstName"
                  placeholder="FName"
                  value={user.firstName}
                  onInput={onInput}
                />
              </div>
              <div className="form-group">
                <label>LastName</label>
                <input
                  className="au-input au-input--full"
                  type="text"
                  name="lastName"
                  placeholder="LName"
                  value={user.lastName}
                  onInput={onInput}
                />
              </div>
              <button
                className="au-btn au-btn--block au-btn--green m-b-20"
                type="submit"
              >
                Save changes
              </button>
            </form>
          </div>
        </AuthLayout>
      ) : (
        <Redirect
          to={{ pathname: RoutePath.Login, state: { from: '/userprofile' } }}
        />
      )}
    </>
  );
};

export default Userprofile;
