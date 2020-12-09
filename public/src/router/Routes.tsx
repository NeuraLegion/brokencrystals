import React, { FC } from 'react';
import { Route, Switch } from 'react-router-dom';
import { RoutePath } from './RoutePath';
import Main from '../pages/Main';
import Login from '../pages/auth/Login/Login';
import Register from '../pages/auth/Register/Register';

export const Routes: FC = () => {
  return (
    <Switch>
      <Route exact path={RoutePath.Home}>
        <Main />
      </Route>

      <Route path={RoutePath.Login}>
        <Login />
      </Route>

      <Route path={RoutePath.Register}>
        <Register />
      </Route>
    </Switch>
  );
};
