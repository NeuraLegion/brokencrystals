import React, { ChangeEvent, FC, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUserPhoto, putPhoto } from '../../../api/httpClient';

export const Sign: FC = () => {
  const user = sessionStorage.getItem('email');
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
    sessionStorage.removeItem('email');
    sessionStorage.removeItem('token');
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
          <Link to="/" className="get-started-btn scrollto" onClick={logout}>
            Log out {user}
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
        <a href="/login" className="get-started-btn scrollto">
          Sign in
        </a>
      )}
    </>
  );
};

export default Sign;
