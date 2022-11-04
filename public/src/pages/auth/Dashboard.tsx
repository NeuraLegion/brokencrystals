import React, { FC } from 'react';
import AuthLayout from './AuthLayout';

export const Dashboard: FC = () => {
  return (
    <AuthLayout>
      <div>
        <div>This is Admin Dashboard.</div>
        <>This page represents </>
        <a href="https://owasp.org/Top10/A01_2021-Broken_Access_Control/">
          AO1 Vertical access controls
        </a>
        <> issue</>
      </div>
    </AuthLayout>
  );
};

export default Dashboard;
