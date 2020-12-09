import React from 'react';
import { RegistrationUser } from '../../../interfaces/User';
import { showVulnElement } from '../../../functions/showVulnMessage';

export function showLdapResponse(ldapResponse: Array<RegistrationUser>) {
  return (
    <>
      {ldapResponse && ldapResponse.length
        ? ldapResponse.map(({ email, firstName, lastName }) => (
            <div key={email}>
              {email && showVulnElement('Email: ' + email)}
              {firstName && showVulnElement('First Name: ' + firstName)}
              {lastName && showVulnElement('Last Name: ' + lastName)}
            </div>
          ))
        : null}
    </>
  );
}

export default showLdapResponse;
