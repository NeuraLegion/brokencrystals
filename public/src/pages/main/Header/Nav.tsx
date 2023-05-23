import React, { useEffect, useState } from 'react';
import { getAdminStatus } from '../../../api/httpClient';
import { RoutePath } from '../../../router/RoutePath';
interface MenuItem {
  name: string;
  path: string;
  newTab: boolean;
  subItems?: Array<MenuItem>;
  admin?: boolean;
}

const menu: Array<MenuItem> = [
  { name: 'Home', path: '/', newTab: false },
  { name: 'Marketplace', path: '/marketplace', newTab: false },
  { name: 'Edit user data', path: RoutePath.Userprofile, newTab: false },
  {
    name: 'Adminmenu',
    path: '',
    newTab: false,
    admin: true,
    subItems: [
      { name: 'Adminpage', path: RoutePath.Adminpage, newTab: false },
      { name: 'Dashboard', path: RoutePath.Dashboard, newTab: false }
    ]
  },
  {
    name: 'API Schema',
    path: '',
    newTab: false,
    subItems: [
      {
        name: 'OpenAPI 3.0 JSON',
        path: '/swagger-json',
        newTab: true
      },
      {
        name: 'API Reference',
        path: '/swagger',
        newTab: true
      },
      {
        name: 'GraphiQL',
        path: '/graphiql',
        newTab: true
      }
    ]
  },
  {
    name: 'Vulnerabilities',
    path:
      'https://github.com/NeuraLegion/brokencrystals#vulnerabilities-overview',
    newTab: true
  }
];

export const Nav = () => {
  const user = sessionStorage.getItem('email') || localStorage.getItem('email');
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);

  useEffect(() => {
    checkIsAdmin();
  }, [isAdminUser]);

  const checkIsAdmin = () => {
    if (user) {
      getAdminStatus(user).then((data) => {
        setIsAdminUser(data.isAdmin);
      });
    }
  };

  const menuItem = (item: MenuItem, i: number) => {
    return (
      <li
        className={`${item.subItems && 'drop-down'} ${
          window.location.pathname == item.path && 'active'
        }`}
        key={i}
      >
        <a href={item.path} target={item.newTab ? '_blank' : undefined}>
          {item.name}
        </a>
        {item.subItems && (
          <ul>
            {item.subItems.map((item, i) => (
              <li key={i}>
                <a href={item.path} target={item.newTab ? '_blank' : undefined}>
                  {item.name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <nav className="nav-menu d-none d-lg-block">
      <ul>
        {menu.map((item, i) =>
          !item.admin || isAdminUser ? menuItem(item, i) : <></>
        )}
      </ul>
    </nav>
  );
};
export default Nav;
