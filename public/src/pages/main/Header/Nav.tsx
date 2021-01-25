import React from 'react';

export const Nav = () => {
  return (
    <nav className="nav-menu d-none d-lg-block">
      <ul>
        <li className="active">
          <a href="/">Home</a>
        </li>
        <li>
          <a href="/">Marketplace</a>
        </li>
        <li className="drop-down">
          <a href="">Gemstones</a>
          <ul>
            <li>
              <a href="/">Gemstone 1</a>
            </li>
            <li>
              <a href="/">Gemstone 2</a>
            </li>
            <li>
              <a href="/">Gemstone 3</a>
            </li>
            <li>
              <a href="/">Gemstone 4</a>
            </li>
          </ul>
        </li>
        <li className="drop-down">
          <a href="">Healing</a>
          <ul>
            <li>
              <a href="/">Healing 1</a>
            </li>
            <li>
              <a href="/">Healing 2</a>
            </li>
            <li>
              <a href="/">Healing 3</a>
            </li>
            <li>
              <a href="/">Healing 4</a>
            </li>
          </ul>
        </li>
        <li className="drop-down">
          <a href="">Jewellery</a>
          <ul>
            <li>
              <a href="/">Jewellery 1</a>
            </li>
            <li>
              <a href="/">Jewellery 2</a>
            </li>
            <li>
              <a href="/">Jewellery 3</a>
            </li>
            <li>
              <a href="/">Jewellery 4</a>
            </li>
          </ul>
        </li>
        <li>
          <a href="/">Contact</a>
        </li>
        <li>
          <a
            href="https://github.com/NeuraLegion/brokencrystals#vulnerabilities-overview"
            target="_blank"
          >
            Vulnerabilities
          </a>
        </li>
      </ul>
    </nav>
  );
};

export default Nav;
