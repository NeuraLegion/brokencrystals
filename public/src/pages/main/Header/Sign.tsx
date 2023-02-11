import React, { ChangeEvent, FC, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUserPhoto, putPhoto } from '../../../api/httpClient';
import { RoutePath } from '../../../router/RoutePath';

export const Sign: FC = () => {
  const user = sessionStorage.getItem('email') || localStorage.getItem('email');
  const userName =
    sessionStorage.getItem('userName') || localStorage.getItem('userName');
  const [userImage, setUserImage] = useState<string | null>();

  useEffect(() => {
    getPhoto();
  }, []);

  const sendPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file: File = (e.target.files as FileList)[0];
    if (!file || !user) return null;

    putPhoto(file, user).then(() => getPhoto());
  };

  const getPhoto = () => {
    if (!user) return null;

    getUserPhoto(user).then((data) => {
      const base64 = new Buffer(data, 'binary').toString('base64');
      base64 && setUserImage(`data: image / png; base64, ${base64}`);
    });
  };

  const logout = () => {
    sessionStorage.clear();
    localStorage.clear();
    window.location.reload();
  };

  return (
    <>
      {user ? (
        <>
          <label htmlFor="file-input" className="file-input-label">
            <img
              src={userImage || 'assets/img/profile.png'}
              alt=""
              className="profile-image"
            />
          </label>
          <Link
            to={RoutePath.Home}
            className="get-started-btn scrollto"
            onClick={logout}
          >
            Log out {userName}
          </Link>
          <input
            id="file-input"
            type="file"
            accept="image/x-png"
            style={{ display: 'none' }}
            onChange={sendPhoto}
          />
        </>
      ) : (
        <>
          <a
            href={`${RoutePath.Login}?logobgcolor=transparent`}
            className="get-started-btn scrollto"
          >
            Sign in
          </a>
          <a href={RoutePath.LoginNew} className="get-started-btn scrollto">
            2-step Sign in
          </a>
        </>
      )}
    </>
  );
};

export default Sign;
