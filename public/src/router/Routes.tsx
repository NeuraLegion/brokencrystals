import React, { FC } from 'react';
import { Route, Switch, Redirect } from 'react-router-dom';
import { RoutePath } from './RoutePath';
import Main from '../pages/main/Main';
import Login from '../pages/auth/Login/Login';
import Register from '../pages/auth/Register/Register';
import Marketplace from '../pages/marketplace/Marketplace';

export const Routes: FC = () => {
  const user = sessionStorage.getItem('email');
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

      <Route path={RoutePath.Home}>
        <Main />
      </Route>
    </Switch>
  );
};
