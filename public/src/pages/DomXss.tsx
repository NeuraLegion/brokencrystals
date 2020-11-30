import React, { FC } from "react";

export const DomXss: FC = () => {
  return (
    <>
      <p>Write something in the text field to trigger a function.</p>
      <input
        name="myfield"
        className="myclass"
        type="text"
        onInput={(e) => e.currentTarget.value}
      />
      <p id="demo" />
    </>
  );
};

export default DomXss;
