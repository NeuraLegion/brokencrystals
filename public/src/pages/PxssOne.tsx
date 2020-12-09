import React, { FC } from 'react';

interface Props {
  comments: Array<{ name: any; content: any }>;
}

export const PxssOne: FC<Props> = (props: Props) => {
  const { comments } = props;

  return (
    <>
      <h1>Please leave a comment:</h1>
      <form id="form" method="post">
        <label htmlFor="name">Name</label>
        <input type="text" id="name" name="name" />
        <label htmlFor="content">Comment</label>
        <input type="text" id="content" name="content" />
        <button id="submit">Submit</button>
      </form>
      <div>
        <table style={{ width: '100%' }}>
          {comments.map((comment) => (
            <tr>
              <td>{comment.name}</td>
              <td>{comment.content}</td>
            </tr>
          ))}
        </table>
      </div>
    </>
  );
};

export default PxssOne;
