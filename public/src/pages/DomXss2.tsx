import React, { FC, FormEvent, useState } from 'react';

export const DomXss2: FC = () => {
  const [firstName, setFirstName] = useState<string>();
  const [lastName, setLastName] = useState<string>();

  function run(event: FormEvent) {
    event.preventDefault();

    const tagString = `<div>${firstName} ${lastName}</div>`;
    const range = document.createRange();
    range.selectNode(document.documentElement);
    const documentFragment = range.createContextualFragment(tagString);
    document.body.appendChild(documentFragment);
  }

  return (
    <form id="form">
      <label htmlFor="first_name">First name</label>
      <input
        type="text"
        id="first_name"
        value={firstName}
        onInput={(e) => setFirstName(e.currentTarget.value)}
      />
      <label htmlFor="last_name">Last name</label>
      <input
        type="text"
        id="last_name"
        value={lastName}
        onInput={(e) => setLastName(e.currentTarget.value)}
      />
      <button id="submit_button" onClick={run}>
        Submit
      </button>
    </form>
  );
};

export default DomXss2;
