'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Settings, Menu as MenuIcon, LogOut, User, Grid, Bookmark, Heart } from 'lucide-react';

export default function ProfilePage({ params }) {
  const [activeTab, setActiveTab] = useState('posts');

  // Placeholder handler for logout - replace with your actual auth logout logic/context
  const handleLogout = () => {
    if (confirm('Are you sure you want to log out?')) {
      // e.g., logoutUser();
      window.location.href = '/login';
    }
  };

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Top Header */}
      <header className="sticky top-0 z-10 bg-black/80 backdrop-blur-md border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white tracking-wide">Profile</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors"
            title="Settings"
          >
            <Settings size={20} />
          </Link>
          <Link
            href="/menu"
            className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors"
            title="Menu"
          >
            <MenuIcon size={20} />
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-xl mx-auto px-4 pt-6">
        {/* User Info Header */}
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
            <User size={40} className="text-zinc-500" />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold truncate text-white">User Profile</h2>
            <p className="text-xs text-zinc-400 truncate">@user_handle</p>
            <p className="text-sm text-zinc-300 mt-1 line-clamp-2">
              Welcome to my profile! Managing content and account settings.
            </p>
          </div>
        </div>

        {/* Action Buttons Section */}
        <div className="flex flex-wrap items-center gap-3 mt-6 pt-4 border-t border-zinc-800/60">
          {/* Settings Link */}
          <Link
            href="/settings"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-100 font-medium text-sm transition-all border border-zinc-700/50 shadow-sm"
          >
            <Settings size={18} className="text-zinc-400" />
            <span>Settings</span>
          </Link>

          {/* Menu Link */}
          <Link
            href="/menu"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-100 font-medium text-sm transition-all border border-zinc-700/50 shadow-sm"
          >
            <MenuIcon size={18} className="text-zinc-400" />
            <span>Menu</span>
          </Link>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-medium text-sm transition-all border border-rose-500/20 shadow-sm"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800 mt-8">
          <button
            onClick={() => setActiveTab('posts')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'posts'
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Grid size={18} />
            <span>Posts</span>
          </button>
          <button
            onClick={() => setActiveTab('saved')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'saved'
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Bookmark size={18} />
            <span>Saved</span>
          </button>
          <button
            onClick={() => setActiveTab('liked')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'liked'
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Heart size={18} />
            <span>Liked</span>
          </button>
        </div>

        {/* Tab Content Display */}
        <div className="mt-6 text-center text-zinc-500 text-sm py-12 bg-zinc-900/30 rounded-2xl border border-zinc-800/40">
          {activeTab === 'posts' && <p>No posts published yet.</p>}
          {activeTab === 'saved' && <p>No saved posts.</p>}
          {activeTab === 'liked' && <p>No liked content.</p>}
        </div>
      </main>
    </div>
  );
}
