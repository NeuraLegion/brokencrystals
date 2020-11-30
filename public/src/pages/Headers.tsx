import React, { FC } from "react";

interface Props {
  headers: Array<any>;
}

export const Headers: FC<Props> = (props: Props) => {
  const { headers } = props;

  return (
    <>
      <h1>Nice headers!</h1>
      <table style={{ width: "100%" }}>
        {headers.map((header, index) => (
          <tr>
            <td>{index}</td>
            <td>{header}</td>
          </tr>
        ))}
      </table>
    </>
  );
};

export default Headers;
