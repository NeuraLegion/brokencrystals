import React from 'react';
interface MenuItem {
  name: string;
  path: string;
  newTab: boolean;
  subItems?: Array<MenuItem>;
}

const menu: Array<MenuItem> = [
  { name: 'Home', path: '/', newTab: false },
  { name: 'Marketplace', path: '/marketplace', newTab: false },
  {
    name: 'Gemstones',
    path: '',
    newTab: false,
    subItems: [
      { name: 'Gemstone 1', path: '', newTab: false },
      { name: 'Gemstone 2', path: '', newTab: false },
      { name: 'Gemstone 3', path: '', newTab: false },
      { name: 'Gemstone 4', path: '', newTab: false }
    ]
  },
  {
    name: 'Healing',
    path: '',
    newTab: false,
    subItems: [
      { name: 'Healing 1', path: '', newTab: false },
      { name: 'Healing 2', path: '', newTab: false },
      { name: 'Healing 3', path: '', newTab: false },
      { name: 'Healing 4', path: '', newTab: false }
    ]
  },
  {
    name: 'Jewellery',
    path: '',
    newTab: false,
    subItems: [
      { name: 'Jewellery 1', path: '', newTab: false },
      { name: 'Jewellery 2', path: '', newTab: false },
      { name: 'Jewellery 3', path: '', newTab: false },
      { name: 'Jewellery 4', path: '', newTab: false }
    ]
  },
  { name: 'Contact', path: '', newTab: false },
  {
    name: 'API Schema',
    path: '',
    newTab: false,
    subItems: [
      {
        name: 'OpenAPI 3.0 JSON',
        path: 'https://brokencrystals.com/swagger/json',
        newTab: true
      },
      {
        name: 'API Reference',
        path: 'https://brokencrystals.com/swagger/static/index.html',
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
  return (
    <nav className="nav-menu d-none d-lg-block">
      <ul>
        {menu.map((item, i) => (
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
                    <a
                      href={item.path}
                      target={item.newTab ? '_blank' : undefined}
                    >
                      {item.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
};
export default Nav;
