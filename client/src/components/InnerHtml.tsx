import type { FC, ReactNode } from 'react';
import { createElement } from 'react';

interface InnerHtmlProps {
  html: string;
  tagName?: string;
}

// Render untrusted content as plain text to prevent DOM XSS.
export const InnerHtml: FC<InnerHtmlProps> = ({ html, tagName, ...rest }) => {
  return createElement(tagName ?? 'div', { ...rest }, html as ReactNode);
};
