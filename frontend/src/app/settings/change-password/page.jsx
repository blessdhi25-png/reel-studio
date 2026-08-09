'use client';

import Link from 'next/link';
import { User, Lock, Shield, ChevronRight, LogOut, ArrowLeft } from 'lucide-react';

export default function SettingsPage() {
  const handleLogout = () => {
    if (confirm('Are you sure you want to log out?')) {
      window.location.href = '/login';
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0b14] text-white p-4 font-sans max-w-md mx-auto">
      {/* Header */}
      <div className="mb-6 pt-2">
        <Link
          href="/profile"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white uppercase tracking-widest mb-4"
        >
          <ArrowLeft size={14} />
          <span>Back to Profile</span>
        </Link>
        <h1 className="text-2xl font-black uppercase tracking-wider text-white">
          Settings and Privacy
        </h1>
      </div>

      {/* Settings Options List */}
      <div className="space-y-3">
        {/* Edit Profile */}
        <Link
          href="/profile/edit"
          className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 hover:bg-zinc-800/50 transition-all"
        >
          <div className="flex items-center gap-3">
            <User size={20} className="text-zinc-400" />
            <span className="text-sm font-medium text-zinc-200">Edit profile</span>
          </div>
          <ChevronRight size={18} className="text-zinc-500" />
        </Link>

        {/* Change Password (RESTORED) */}
        <Link
          href="/settings/change-password"
          className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 hover:bg-zinc-800/50 transition-all"
        >
          <div className="flex items-center gap-3">
            <Lock size={20} className="text-amber-500" />
            <span className="text-sm font-medium text-zinc-200">Change password</span>
          </div>
          <ChevronRight size={18} className="text-zinc-500" />
        </Link>

        {/* Privacy Settings */}
        <Link
          href="/settings/privacy"
          className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 hover:bg-zinc-800/50 transition-all"
        >
          <div className="flex items-center gap-3">
            <Shield size={20} className="text-amber-500" />
            <span className="text-sm font-medium text-zinc-200">Privacy</span>
          </div>
          <ChevronRight size={18} className="text-zinc-500" />
        </Link>

        {/* Log Out Button */}
        <button
          onClick={handleLogout}
          className="w-full mt-6 p-4 rounded-xl border border-rose-900/40 bg-rose-950/20 text-rose-400 text-sm font-semibold hover:bg-rose-900/30 transition-all flex items-center justify-center gap-2"
        >
          <LogOut size={18} />
          <span>Log out</span>
        </button>
      </div>
    </div>
  );
}
