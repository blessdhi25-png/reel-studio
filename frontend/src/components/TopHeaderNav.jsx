'use client';

import { useState } from 'react';

const NAV_TABS = ['All', 'Shorts', 'Community', 'LIVE', 'DMs'];

export default function TopHeaderNav({ activeTab, setActiveTab, onSearchClick, onMuteToggle, isMuted }) {
  return (
    <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-4 pt-3 pb-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent select-none pointer-events-none">
      
      {/* 1. Left Action: App Logo or LIVE Button */}
      <div className="flex items-center shrink-0 pointer-events-auto">
        <button className="flex items-center gap-1.5 text-white/90 hover:text-white font-bold text-xs bg-black/30 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/10 transition-all active:scale-95">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="tracking-wide uppercase text-[11px]">LIVE</span>
        </button>
      </div>

      {/* 2. Center: TikTok-Style Navigation Tabs */}
      <nav className="flex-1 max-w-[70%] mx-2 overflow-x-auto no-scrollbar pointer-events-auto">
        <div className="flex items-center justify-center gap-5 px-2">
          {NAV_TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative shrink-0 text-sm md:text-base transition-all duration-200 py-1 ${
                  isActive
                    ? 'text-white font-extrabold scale-105 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]'
                    : 'text-white/60 hover:text-white/90 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]'
                }`}
              >
                {tab}
                
                {/* Active Underline Bar */}
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2.5px] bg-white rounded-full shadow-sm" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* 3. Right Actions: Search & Audio Controls */}
      <div className="flex items-center gap-3 shrink-0 pointer-events-auto">
        <button
          onClick={onSearchClick}
          className="text-white/90 hover:text-white transition-all active:scale-90 p-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
          aria-label="Search"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>

        <button
          onClick={onMuteToggle}
          className="text-white/90 hover:text-white transition-all active:scale-90 p-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
          aria-label="Toggle Sound"
        >
          {isMuted ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
