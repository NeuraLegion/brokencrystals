import React from 'react';

export function showVulnElement(__html: string): JSX.Element | null {
  return __html ? (
    <div
      className="dangerouslySetInnerHTML"
      dangerouslySetInnerHTML={{ __html }}
    />
  ) : null;
}
