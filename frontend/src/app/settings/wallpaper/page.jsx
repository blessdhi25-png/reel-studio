'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Image as ImageIcon } from 'lucide-react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { SettingsPage } from '@/components/settings/SettingsUI';

const STEPS = [
  'Open a video and tap Save (or the bookmark) so it’s in your collection. Videos that creators mark as wallpaper-ready appear here.',
  'Come back to this screen and pick one to preview it.',
  'Tap Set as wallpaper and choose your home screen, lock screen, or both.',
];

export default function WallpaperPage() {
  const ok = useRequireAuth();
  const [showHow, setShowHow] = useState(false);
  if (!ok) return null;

  return (
    <SettingsPage title="Wallpaper">
      <div className="flex flex-col items-center text-center pt-10 pb-6">
        <span className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
          <ImageIcon size={30} strokeWidth={2} aria-hidden="true" />
        </span>
        <h2 className="font-sans font-extrabold text-xl text-slate-900 dark:text-white">No wallpapers yet</h2>
        <p className="font-sans text-sm text-slate-500 dark:text-neutral-400 mt-1.5 max-w-xs">Wallpapers you collect will show up here so you can set them on your phone.</p>
      </div>

      <div className="space-y-3">
        <Link href="/search?q=wallpaper" className="block w-full text-center py-3.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-sans font-bold text-sm transition-colors">
          Find wallpapers
        </Link>
        <button
          type="button"
          onClick={() => setShowHow((v) => !v)}
          aria-expanded={showHow}
          className="block w-full text-center py-3.5 rounded-full bg-slate-200/70 dark:bg-neutral-800 text-slate-900 dark:text-white font-sans font-bold text-sm hover:bg-slate-200 dark:hover:bg-neutral-700 transition-colors"
        >
          Find out how to set wallpapers
        </button>
      </div>

      {showHow && (
        <ol className="mt-4 space-y-2.5 rounded-2xl bg-white dark:bg-neutral-900/90 border border-slate-200 dark:border-neutral-800 p-4">
          {STEPS.map((st, i) => (
            <li key={i} className="flex gap-3 font-sans text-sm text-slate-700 dark:text-neutral-300 leading-snug">
              <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center justify-center">{i + 1}</span>
              <span>{st}</span>
            </li>
          ))}
          <li className="font-sans text-xs text-slate-500 dark:text-neutral-500 pt-1">Setting a wallpaper from a video isn’t switched on yet; this is how it will work when it launches.</li>
        </ol>
      )}
    </SettingsPage>
  );
}
