import React, { FC } from 'react';
import { Route, Switch } from 'react-router-dom';
import Main from '../pages/Main';
import Login from '../pages/users/Login';
import { RoutePath } from './RoutePath';
import Forgotten from '../pages/users/Forgotten';
import Register from '../pages/users/Register';
import Dashboard from '../pages/users/Dashboard';
import Base from '../pages/users/Base';
import Detail from '../pages/shop/Detail';
import Listing from '../pages/shop/Listing';
import Wishlist from '../pages/shop/Wishlist';
import Checkout from '../pages/shop/Checkout';
import Cart from '../pages/shop/Cart';

export const Routes: FC = () => {
  return (
    <Switch>
      <Route exact path={RoutePath.Home}>
        <Main />
      </Route>

      <Route path={RoutePath.Login}>
        <Login />
      </Route>

      <Route path={RoutePath.Forgotten}>
        <Forgotten />
      </Route>

      <Route path={RoutePath.Register}>
        <Register />
      </Route>

      <Route path={RoutePath.Dashboard}>
        <Dashboard />
      </Route>

      <Route path={RoutePath.Base}>
        <Base />
      </Route>

      <Route path={RoutePath.Detail}>
        <Detail />
      </Route>

      <Route path={RoutePath.Listing}>
        <Listing />
      </Route>

      <Route path={RoutePath.Wishlist}>
        <Wishlist />
      </Route>

      <Route path={RoutePath.Checkout}>
        <Checkout />
      </Route>

      <Route path={RoutePath.Cart}>
        <Cart />
      </Route>
    </Switch>
  );
};
