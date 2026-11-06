'use client';

import { useEffect, useRef } from 'react';

// Labels here must match `FILTERS` labels in app/page.jsx exactly
// (case aside) for entries that should route via handleMobileTabSelect's
// FILTERS lookup — 'DMs' is the one deliberate exception, handled as an
// explicit case in that function since it has no FILTERS entry.
const NAV_TABS = ['All', 'Shorts', 'Communities', 'Collections', 'LIVE', 'DMs'];

export default function TopHeaderNav({ activeTab, setActiveTab, onSearchClick, onMuteToggle, isMuted }) {
  const activeRef = useRef(null);

  // Keep the selected tab visible when the strip is scrolled (small phones
  // can't fit all six labels).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeTab]);

  return (
    <header className="sticky top-0 z-40 w-full bg-black/90 backdrop-blur-md border-b border-neutral-800/80 px-4 py-3 flex items-center justify-between gap-4 select-none">
      {/* Tabs — the ONLY scrolling region. min-w-0 lets the flex child shrink below its content
          width so it scrolls instead of overlapping the search/mute buttons, and items start-align
          so overflow is reachable (centering clips the first tabs off-screen). */}
      <nav aria-label="Feed sections" className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
        <div className="flex items-center justify-start gap-6 w-max">
          {NAV_TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                ref={isActive ? activeRef : undefined}
                onClick={() => setActiveTab(tab)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative shrink-0 whitespace-nowrap flex items-center gap-1.5 font-bold text-white text-sm min-h-[40px] px-0.5 transition-opacity ${
                  isActive ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                }`}
              >
                {tab === 'LIVE' && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />}
                {tab}
                {/* Active underline */}
                {isActive && (
                  <span className="absolute bottom-0 inset-x-0 h-[3px] bg-amber-500 rounded-full" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* 3. Right Actions: Search & Audio Controls */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onSearchClick}
          className="text-white hover:text-white transition-all active:scale-90 p-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
          aria-label="Search"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
        <button
          onClick={onMuteToggle}
          className="text-white hover:text-white transition-all active:scale-90 p-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
          aria-label="Toggle Sound"
        >
          {isMuted ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
