'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

// Bold, high-contrast back button for header bars. Defaults to router.back();
// pass `href` when the destination is specific (e.g. "back to Studio"), or `onClick`
// for custom logic (e.g. history fallback).
export default function BackButton({ className = '', href, onClick, label = 'Go back' }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (onClick ? onClick() : href ? router.push(href) : router.back())}
      className={`p-2.5 rounded-full bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 text-black dark:text-white transition-all active:scale-95 flex items-center justify-center ${className}`}
      aria-label={label}
    >
      <ArrowLeft className="w-5 h-5 stroke-[3]" />
    </button>
  );
}
