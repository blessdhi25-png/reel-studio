'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MoreHorizontal, Settings, Menu as MenuIcon, Share2, Home } from 'lucide-react';

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState('videos');

  const handleLogout = () => {
    if (confirm('Are you sure you want to log out?')) {
      window.location.href = '/login';
    }
  };

  return (
    <div className="min-h-screen bg-[#0a090e] text-white pb-24 font-sans max-w-md mx-auto">
      {/* Top Header */}
      <div className="px-4 pt-3 flex items-center justify-between">
        <Link
          href="/feed"
          className="flex items-center gap-1 text-[11px] font-mono tracking-widest text-emerald-400 hover:text-emerald-300 uppercase"
        >
          <ArrowLeft size={12} />
          <span>Feed</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={handleLogout}
            className="px-4 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900/60 text-rose-400 text-xs hover:bg-zinc-800 transition-colors"
          >
            Log out
          </button>
          <button className="p-1 text-zinc-400 hover:text-white">
            <MoreHorizontal size={20} />
          </button>
        </div>
      </div>

      <div className="px-4 pt-2">
        {/* User Identity */}
        <div className="flex items-center gap-4 mb-3">
          <div className="w-20 h-20 rounded-full border-2 border-zinc-700 bg-zinc-900 flex items-center justify-center shrink-0">
            <span className="text-amber-500 font-black text-2xl">S</span>
          </div>
        </div>

        <div className="mb-4">
          <h1 className="text-xl font-black tracking-wider text-white uppercase">
            ASEDA BLESS
          </h1>
          <p className="text-xs text-zinc-500 font-mono">@scheme</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-1 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-3 text-center mb-4">
          <div>
            <p className="text-base font-bold text-white">0</p>
            <p className="text-[10px] text-zinc-400 font-medium">Following</p>
          </div>
          <div>
            <p className="text-base font-bold text-white">2</p>
            <p className="text-[10px] text-zinc-400 font-medium">Followers</p>
          </div>
          <div>
            <p className="text-base font-bold text-white">0</p>
            <p className="text-[10px] text-zinc-400 font-medium">Videos</p>
          </div>
          <div>
            <p className="text-base font-bold text-white">0</p>
            <p className="text-[10px] text-zinc-400 font-medium">Likes</p>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          <Link
            href="/profile/edit"
            className="flex items-center justify-center py-2.5 rounded-xl bg-amber-500 text-black text-xs font-extrabold tracking-wide hover:bg-amber-400 transition-all"
          >
            Edit Profile
          </Link>
          <Link
            href="/studio"
            className="flex items-center justify-center gap-1 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-amber-500 text-xs font-bold hover:bg-zinc-800 transition-all"
          >
            <Home size={14} />
            <span>Studio</span>
          </Link>
          <button className="flex items-center justify-center py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition-all">
            <Share2 size={16} />
          </button>
        </div>

        {/* Secondary Action Row: Settings & Menu */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <Link
            href="/settings"
            className="flex items-center justify-center gap-2 py-2 rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-200 text-xs font-semibold hover:bg-zinc-800 transition-all"
          >
            <Settings size={14} className="text-amber-500" />
            <span>Settings</span>
          </Link>
          <Link
            href="/menu"
            className="flex items-center justify-center gap-2 py-2 rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-200 text-xs font-semibold hover:bg-zinc-800 transition-all"
          >
            <MenuIcon size={14} className="text-amber-500" />
            <span>Menu</span>
          </Link>
        </div>

        {/* Content Tabs */}
        <div className="grid grid-cols-3 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-1 mb-6">
          <button
            onClick={() => setActiveTab('videos')}
            className={`py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'videos'
                ? 'bg-amber-500 text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Videos
          </button>
          <button
            onClick={() => setActiveTab('saved')}
            className={`py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'saved'
                ? 'bg-amber-500 text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Saved
          </button>
          <button
            onClick={() => setActiveTab('liked')}
            className={`py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'liked'
                ? 'bg-amber-500 text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Liked
          </button>
        </div>

        {/* Tab Content area */}
        <div className="py-12 text-center text-xs text-zinc-500 font-mono">
          No videos posted yet.
        </div>
      </div>
    </div>
  );
}
