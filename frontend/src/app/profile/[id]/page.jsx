'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  MoreHorizontal, 
  Home, 
  Share2, 
  Settings, 
  Menu as MenuIcon, 
  LogOut 
} from 'lucide-react';

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState('videos');

  const handleLogout = () => {
    if (confirm('Are you sure you want to log out?')) {
      // Clear auth token/session here if needed
      window.location.href = '/login';
    }
  };

  return (
    <div className="min-h-screen bg-black text-white pb-24 font-sans">
      {/* Top Header */}
      <div className="px-4 pt-4 flex items-center justify-between">
        <Link 
          href="/feed" 
          className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-emerald-400 hover:text-emerald-300 uppercase"
        >
          <ArrowLeft size={14} />
          <span>Feed</span>
        </Link>
        
        <div className="flex items-center gap-2">
          {/* Top Logout Button Matching Screenshot */}
          <button 
            onClick={handleLogout}
            className="px-4 py-1.5 rounded-2xl border border-zinc-800 text-rose-400 text-sm hover:bg-zinc-900 transition-colors"
          >
            Log out
          </button>
          <button className="p-2 text-zinc-400 hover:text-white">
            <MoreHorizontal size={20} />
          </button>
        </div>
      </div>

      <div className="px-5 pt-4">
        {/* User Avatar & Name */}
        <div className="flex items-center gap-4 mb-3">
          <div className="relative w-20 h-20 rounded-full border-2 border-zinc-500 overflow-hidden bg-zinc-900 flex items-center justify-center">
            <span className="text-amber-500 font-extrabold text-lg tracking-tight">
              BLESS ADIKA
            </span>
          </div>
        </div>

        <div className="mb-4">
          <h1 className="text-xl font-black tracking-wide text-white uppercase">
            BLESS ADIKA
          </h1>
          <p className="text-xs text-zinc-500 font-medium">@blessadika</p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-2 bg-zinc-950 border border-zinc-800/80 rounded-2xl p-3 text-center mb-5">
          <div>
            <p className="text-lg font-bold text-white">2</p>
            <p className="text-[11px] text-zinc-400 font-medium">Following</p>
          </div>
          <div>
            <p className="text-lg font-bold text-white">0</p>
            <p className="text-[11px] text-zinc-400 font-medium">Followers</p>
          </div>
          <div>
            <p className="text-lg font-bold text-white">5</p>
            <p className="text-[11px] text-zinc-400 font-medium">Videos</p>
          </div>
          <div>
            <p className="text-lg font-bold text-white">0</p>
            <p className="text-[11px] text-zinc-400 font-medium">Likes</p>
          </div>
        </div>

        {/* Primary Action Row: Edit Profile, Studio, Share */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Link
            href="/profile/edit"
            className="flex items-center justify-center py-2.5 rounded-xl bg-red-950/80 border border-red-900/50 text-emerald-400 text-xs font-bold tracking-wide transition-all hover:bg-red-900/80"
          >
            Edit Profile
          </Link>
          <Link
            href="/studio"
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-emerald-400 text-xs font-bold tracking-wide transition-all hover:bg-zinc-900"
          >
            <Home size={14} />
            <span>Studio</span>
          </Link>
          <button className="flex items-center justify-center py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 hover:bg-zinc-900 transition-all">
            <Share2 size={16} />
          </button>
        </div>

        {/* Secondary Action Row: Settings & Menu Buttons */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          <Link
            href="/settings"
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-200 text-xs font-bold tracking-wide hover:bg-zinc-800 transition-all"
          >
            <Settings size={15} className="text-zinc-400" />
            <span>Settings</span>
          </Link>
          <Link
            href="/menu"
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-200 text-xs font-bold tracking-wide hover:bg-zinc-800 transition-all"
          >
            <MenuIcon size={15} className="text-zinc-400" />
            <span>Menu</span>
          </Link>
        </div>

        {/* Content Tabs */}
        <div className="grid grid-cols-3 bg-zinc-950 border border-zinc-800/80 rounded-2xl p-1 mb-4">
          <button
            onClick={() => setActiveTab('videos')}
            className={`py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all ${
              activeTab === 'videos'
                ? 'bg-red-950/90 text-amber-500 border border-red-900/40 shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Videos
          </button>
          <button
            onClick={() => setActiveTab('saved')}
            className={`py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all ${
              activeTab === 'saved'
                ? 'bg-red-950/90 text-amber-500 border border-red-900/40 shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Saved
          </button>
          <button
            onClick={() => setActiveTab('liked')}
            className={`py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all ${
              activeTab === 'liked'
                ? 'bg-red-950/90 text-amber-500 border border-red-900/40 shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Liked
          </button>
        </div>

        {/* Content Display */}
        <div className="grid grid-cols-2 gap-3">
          {activeTab === 'videos' && (
            <div className="aspect-[3/4] bg-zinc-950 border border-zinc-800 rounded-2xl p-3 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-amber-500 tracking-wider uppercase">
                SHORT
              </span>
            </div>
          )}
          {activeTab === 'saved' && (
            <div className="col-span-2 py-10 text-center text-xs text-zinc-500">
              No saved videos yet.
            </div>
          )}
          {activeTab === 'liked' && (
            <div className="col-span-2 py-10 text-center text-xs text-zinc-500">
              No liked videos yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
