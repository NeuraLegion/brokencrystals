import React, { FC, useEffect, useState } from 'react';
import { getAdminStatus } from 'src/api/httpClient';
import AuthLayout from './AuthLayout';

export const AdminPage: FC = () => {
  const user = sessionStorage.getItem('email');
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  useEffect(() => {
    if (user) getAdminStatus(user).then((data) => setIsAdmin(data || false));
  }, [user]);

  return (
    <AuthLayout>
      {isAdmin === true ? (
        <div>This is AdminPage</div>
      ) : (
        <div>This page is forbidden for you</div>
      )}
    </AuthLayout>
  );
};

export default AdminPage;
