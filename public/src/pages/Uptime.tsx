import React, { FC } from 'react';

export const Uptime: FC<string> = (response: string) => {
  return (
    <>
      <h1>We've been up for quite some time!</h1>
      <p>{response}</p>
    </>
  );
};

export default Uptime;
