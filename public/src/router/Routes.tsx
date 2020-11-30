import React, { FC } from "react";
import { Route, Switch } from "react-router-dom";
import Main from "../pages/Main";
import Login from "../pages/users/Login";
import { RoutePath } from "./RoutePath";
import Forgotten from "../pages/users/Forgotten";
import Register from "../pages/users/Register";

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
    </Switch>
  );
};
