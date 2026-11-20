'use client';

import { Fragment } from 'react';

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)'"\]])/g;

// Plain text with http(s) links made tappable. Links back to this site stay in the same tab (so an invite to
// /live/<id> opens straight in the app); everything else opens in a new tab without leaking the opener.
export default function LinkifiedText({ text, className = '' }) {
  const parts = String(text ?? '').split(URL_RE);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <span className={`break-words whitespace-pre-wrap ${className}`}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
        const internal = origin && part.startsWith(`${origin}/`);
        return (
          <a
            key={i}
            href={part}
            {...(internal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
            onClick={(e) => e.stopPropagation()}
            className="underline underline-offset-2 font-semibold"
          >
            {part}
          </a>
        );
      })}
    </span>
  );
}
