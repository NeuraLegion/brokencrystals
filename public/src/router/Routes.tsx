import React, { FC } from 'react';
import { Route, Switch } from 'react-router-dom';
import { RoutePath } from './RoutePath';
import Main from '../pages/main/Main';
import Login from '../pages/auth/Login/Login';
import Register from '../pages/auth/Register/Register';

export const Routes: FC = () => {
  return (
    <Switch>
      <Route path={RoutePath.Login}>
        <Login />
      </Route>

      <Route path={RoutePath.Register}>
        <Register />
      </Route>

      <Route path={RoutePath.Home}>
        <Main />
      </Route>
    </Switch>
  );
};
