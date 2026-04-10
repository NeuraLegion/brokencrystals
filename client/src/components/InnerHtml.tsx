import type { FC } from 'react';
import { createElement } from 'react';

interface InnerHtmlProps {
  html: string;
  tagName?: string;
  allowRerender?: boolean;
}

// Render as text to avoid HTML injection from untrusted content.
export const InnerHtml: FC<InnerHtmlProps> = ({
  html,
  tagName,
  allowRerender,
  ...rest
}) => {
  return createElement(tagName ?? 'div', { ...rest }, html ?? '');
};
