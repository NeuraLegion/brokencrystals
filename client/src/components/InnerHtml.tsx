import type { FC } from 'react';
import { createElement, useEffect, useRef } from 'react';

interface InnerHtmlProps {
  html: string;
  tagName?: string;
  allowRerender?: boolean;
}

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// Renders untrusted content as text to prevent XSS.
export const InnerHtml: FC<InnerHtmlProps> = ({
  html,
  tagName,
  allowRerender,
  ...rest
}) => {
  const elementRef = useRef<HTMLElement | null>(null);
  const isFirstRender = useRef<boolean>(true);

  useEffect(() => {
    if (!elementRef.current) {
      return;
    }

    const safeHtml = escapeHtml((html ?? '').toString());

    if (!isFirstRender.current && !allowRerender) {
      return;
    }
    isFirstRender.current = Boolean(allowRerender);

    elementRef.current.innerHTML = safeHtml;
  }, [html, allowRerender]);

  return createElement(tagName ?? 'div', { ...rest, ref: elementRef });
};
