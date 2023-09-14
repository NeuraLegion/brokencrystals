import React, { FC, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { goTo, postMetadata, getSpawnData } from '../../../api/httpClient';
import Nav from './Nav';
import Sign from './Sign';

interface Props {
  onInnerPage?: boolean;
}

export const Header: FC<Props> = (props: Props) => {
  useEffect(() => {
    postMetadata().then((data) => console.log('xml', data));
    getSpawnData().then((data) => console.log('spawn', data));
  }, []);

  const sendGoTo = (url: string) => () => {
    goTo(url).then(() => console.log('goto', url));
  };

  return (
    <header
      id="header"
      className={`fixed-top ${props.onInnerPage ? 'header-inner-pages' : ''}`}
    >
      <div className="container-fluid">
        <div className="row justify-content-center">
          <div className="col-xl-9 d-flex align-items-center">
            <Link to="/" className="logo mr-auto" onClick={sendGoTo('/')}>
              <img src="assets/img/logo.png" alt="" className="img-fluid" />{' '}
              BROKEN CRYSTALS
            </Link>

            <Nav />

            <Sign />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
