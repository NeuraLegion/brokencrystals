import React from 'react';
import InnerHTML from 'dangerously-set-html-content';
import { LoginResponse } from '../../../interfaces/User';

export function showLoginResponse({ email, ldapProfileLink }: LoginResponse) {
  const fields = [
    { title: 'Email', value: email },
    { title: 'LDAP', value: ldapProfileLink }
  ];

  return (
    <>
      {fields.map(
        ({ title, value }) =>
          value && (
            <div className="dangerous-html" key={title}>
              <InnerHTML html={`${title}: ${value}`} />
            </div>
          )
      )}
    </>
  );
}

export default showLoginResponse;
