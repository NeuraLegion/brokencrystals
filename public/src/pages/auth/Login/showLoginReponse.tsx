import React from 'react';
import { LoginResponse } from '../../../interfaces/User';
import { showVulnElement } from '../../../functions/showVulnMessage';

export function showLoginResponse({ email, ldapProfileLink }: LoginResponse) {
  return (
    <>
      {email && showVulnElement('Email: ' + email)}
      {ldapProfileLink && showVulnElement('LDAP: ' + ldapProfileLink)}
    </>
  );
}

export default showLoginResponse;
