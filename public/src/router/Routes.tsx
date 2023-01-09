import React, { FC } from 'react';
import { Route, Switch, Redirect } from 'react-router-dom';
import { RoutePath } from './RoutePath';
import Main from '../pages/main/Main';
import Login from '../pages/auth/Login/Login';
import LoginNew from '../pages/auth/LoginNew/LoginNew';
import Register from '../pages/auth/Register/Register';
import Marketplace from '../pages/marketplace/Marketplace';
import Userprofile from '../pages/main/Userprofile';
import AdminPage from '../pages/auth/AdminPage';
import PasswordCheck from '../pages/auth/LoginNew/PasswordCheck';
import Dashboard from '../pages/auth/Dashboard';

export const Routes: FC = () => {
  const user = sessionStorage.getItem('email') || localStorage.getItem('email');

  return (
    <Switch>
      <Route path={RoutePath.Login}>
        <Login />
      </Route>

      <Route path={RoutePath.LoginNew}>
        <LoginNew />
      </Route>

      <Route path={RoutePath.PasswordCheck}>
        {user ? (
          <PasswordCheck />
        ) : (
          <Redirect
            to={{ pathname: RoutePath.Home, state: { from: '/passwordcheck' } }}
          />
        )}
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
        {user ? (
          <AdminPage />
        ) : (
          <Redirect
            to={{ pathname: RoutePath.Home, state: { from: '/adminpage' } }}
          />
        )}
      </Route>

      <Route path={RoutePath.Dashboard}>
        {user ? (
          <Dashboard />
        ) : (
          <Redirect
            to={{ pathname: RoutePath.Home, state: { from: '/dashboard' } }}
          />
        )}
      </Route>

      <Route path="*">
        <Redirect to={{ pathname: RoutePath.Home }} />
        <Main />
      </Route>
    </Switch>
  );
};
