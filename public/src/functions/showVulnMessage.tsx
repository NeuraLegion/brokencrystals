import React from 'react';

export function showVulnElement(__html: string): JSX.Element | null {
  if (!__html) return null;

  return (
    <div className="dangerous-html" dangerouslySetInnerHTML={{ __html }} />
  );
}
