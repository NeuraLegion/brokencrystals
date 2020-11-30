import React, { FC } from "react";

export const ReflectedXss: FC<string> = (id: string) => {
  return (
    <>
      <h1>Reflection: </h1>
      <p>{id}</p>
    </>
  );
};

export default ReflectedXss;
