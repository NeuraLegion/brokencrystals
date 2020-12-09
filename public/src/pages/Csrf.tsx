import React, { FC } from 'react';

export const Csrf: FC = () => {
  return (
    <form method="POST">
      <input type="text" name="account" value="account" />
      <input type="text" name="amount" value="amount" />
      <input type="submit" value="Submit" />
    </form>
  );
};

export default Csrf;
