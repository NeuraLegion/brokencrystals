import React from 'react';
import { RegistrationUser } from '../../../interfaces/User';
import showRegResponse from '../Register/showRegReponse';

export function showLdapResponse(ldapResponse: Array<RegistrationUser>) {
  if (!ldapResponse?.length) return null;

  return (
    <>
      {ldapResponse.map((response) => (
        <div key={response.email}>{showRegResponse(response)}</div>
      ))}
    </>
  );
}

export default showLdapResponse;
