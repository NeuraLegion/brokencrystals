import React from 'react';
import { RegistrationUser } from '../../../interfaces/User';
import { showVulnElement } from '../../../functions/showVulnMessage';

export function showRegResponse({
  email,
  firstName,
  lastName
}: RegistrationUser) {
  return (
    <>
      {email && showVulnElement('Email: ' + email)}
      {firstName && showVulnElement('First Name: ' + firstName)}
      {lastName && showVulnElement('Last Name: ' + lastName)}
    </>
  );
}

export default showRegResponse;
