import React from 'react';
import InnerHTML from 'dangerously-set-html-content';
import { RegistrationUser } from '../../../interfaces/User';

export function showRegResponse({
  email,
  firstName,
  lastName
}: RegistrationUser) {
  const fields = [
    { title: 'Email', value: email },
    { title: 'First Name', value: firstName },
    { title: 'Last Name', value: lastName }
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

export default showRegResponse;
