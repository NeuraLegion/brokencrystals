import React, { FC, useEffect, useState } from 'react';
import { UserData } from '../../interfaces/User';
import { getAdminStatus, searchUsers } from '../../api/httpClient';
import AdminLayout from './AdminLayout';

export const AdminPage: FC = () => {
  const user = sessionStorage.getItem('email') || localStorage.getItem('email');
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState('');
  const [users, setUsers] = useState<UserData[]>([]);

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  useEffect(() => {
    if (user) {
      getAdminStatus(user).then((data) => setIsAdmin(!!data.isAdmin));
      searchUsers(inputValue).then((data) => {
        setUsers(data);
      });
    }
  }, [user, inputValue]);

  return (
    <AdminLayout>
      {isAdmin ? (
        <>
          <div>User catalog:</div>
          <div>
            <b>Hint</b>: to see more results typing specific name
          </div>
          <input
            type="text"
            className="au-input au-input--full"
            placeholder="Start typing name"
            onChange={onInput}
          />
          <div>
            {users.map((user) => (
              <div key={user.id}>
                <b>First name:</b> {user.firstName}, <b>Last name:</b>{' '}
                {user.lastName},<b>e-mail:</b> {user.email}, <b>company:</b>{' '}
                {user.company}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div>This page is forbidden for you</div>
      )}
    </AdminLayout>
  );
};

export default AdminPage;
