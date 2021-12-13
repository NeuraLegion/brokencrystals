import React, { FC, useEffect, useState } from 'react';
import { Route, Switch, Redirect } from 'react-router-dom';
import { RoutePath } from './RoutePath';
import Main from '../pages/main/Main';
import Login from '../pages/auth/Login/Login';
import Register from '../pages/auth/Register/Register';
import Marketplace from '../pages/marketplace/Marketplace';
import Userprofile from '../pages/main/Userprofile';
import AdminPage from '../pages/auth/AdminPage';
import { getUserData } from '../api/httpClient';

export const Routes: FC = () => {
  const user = sessionStorage.getItem('email');
  const [isAdminUser, setIsAdminUser] = useState<boolean>(true);
  useEffect(() => {
    verifyAdminPermissions();
  }, [isAdminUser]);

  const verifyAdminPermissions = () => {
    if (user) {
      getUserData(user).then((data) => setIsAdminUser(data.isAdmin));
    }
  };

  return (
    <Switch>
      <Route path={RoutePath.Login}>
        <Login />
      </Route>

      <Route path={RoutePath.Register}>
        <Register />
      </Route>

      <Route path={RoutePath.Marketplace}>
        {user ? (
          <Marketplace preview={false} />
        ) : (
          <Redirect
            to={{ pathname: RoutePath.Login, state: { from: '/marketplace' } }}
          />
        )}
      </Route>

      <Route path={RoutePath.Userprofile}>
        {user ? (
          <Userprofile />
        ) : (
          <Redirect
            to={{ pathname: RoutePath.Login, state: { from: '/userprofile' } }}
          />
        )}
      </Route>

      <Route path={RoutePath.Adminpage}>
        {user && isAdminUser ? (
          <AdminPage />
        ) : (
          <Redirect
            to={{ pathname: RoutePath.Home, state: { from: '/adminpage' } }}
          />
        )}
      </Route>

      <Route path={RoutePath.Home}>
        <Main />
      </Route>
    </Switch>
  );
};
