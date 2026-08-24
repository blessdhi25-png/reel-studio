'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { compressImage } from '@/lib/imageCompression';
import { LoadingSpinner } from '@/components/LoadingScreen';

const BIO_MAX = 150;
const DISPLAY_NAME_MAX = 60;

export default function EditProfilePage() {
  const router = useRouter();
  const { user, ready, updateUser } = useAuth();
  const toast = useToast();

  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    setDisplayName(user.displayName || '');
    setBio(user.bio || '');
    setAvatarUrl(user.avatarUrl || '');
    setBannerUrl(user.bannerUrl || '');
  }, [ready, user, router]);

  async function handleAvatarSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const localPreview = URL.createObjectURL(file);
    setAvatarUrl(localPreview);
    setAvatarUploading(true);
    try {
      const compressed = await compressImage(file, { maxDimension: 1200, quality: 0.82 });
      const body = new FormData();
      body.append('avatar', compressed);
      const { avatarUrl: uploaded } = await api.uploadAvatar(body);
      setAvatarUrl(uploaded);
      updateUser({ avatarUrl: uploaded });
      toast.success('Profile photo updated');
    } catch (err) {
      setAvatarUrl(user?.avatarUrl || '');
      toast.error(err.message || 'Could not upload photo');
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleBannerSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const localPreview = URL.createObjectURL(file);
    setBannerUrl(localPreview);
    setBannerUploading(true);
    try {
      const compressed = await compressImage(file, { maxDimension: 1600, quality: 0.82 });
      const body = new FormData();
      body.append('banner', compressed);
      const { bannerUrl: uploaded } = await api.uploadBanner(body);
      setBannerUrl(uploaded);
      updateUser({ bannerUrl: uploaded });
      toast.success('Banner updated');
    } catch (err) {
      setBannerUrl(user?.bannerUrl || '');
      toast.error(err.message || 'Could not upload banner');
    } finally {
      setBannerUploading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      // Only send fields that actually changed from what's cached, rather
      // than the full form state unconditionally — avatarUrl/bannerUrl in
      // particular are already saved the moment a photo finishes uploading
      // above (via api.uploadAvatar/uploadBanner), so re-sending them here
      // would just be redundant, not incorrect. displayName/bio compare
      // against the user object PATCH /users/me actually needs updated.
      const payload = {};
      if (displayName.trim() !== (user.displayName || '')) payload.displayName = displayName.trim();
      if (bio.trim() !== (user.bio || '')) payload.bio = bio.trim();

      if (Object.keys(payload).length > 0) {
        const updated = await api.updateProfile(payload);
        updateUser(updated);
      }
      toast.success('Profile saved');
      router.push(`/profile/${user.id}`);
    } catch (err) {
      toast.error(err.message || 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  if (!ready || !user) {
    return (
      <div className="min-h-screen bg-[#0a090e] text-white flex items-center justify-center">
        <LoadingSpinner label="Loading…" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a090e] text-white pb-16">
      <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800 sticky top-0 bg-[#0a090e]/95 backdrop-blur-xl z-10">
        <button onClick={() => router.back()} className="text-sm text-zinc-400 hover:text-white">
          Cancel
        </button>
        <p className="font-display text-base tracking-wide">Edit Profile</p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm font-bold text-amber-400 hover:text-amber-300 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Banner */}
      <div className="relative w-full h-40 bg-zinc-900">
        {bannerUrl && <img src={bannerUrl} alt="" className="w-full h-full object-cover" />}
        <button
          onClick={() => bannerInputRef.current?.click()}
          disabled={bannerUploading}
          className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/55 transition-colors disabled:opacity-70"
        >
          <span className="bg-black/60 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
            {bannerUploading ? 'Uploading…' : 'Change Banner'}
          </span>
        </button>
        <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerSelect} />
      </div>

      {/* Avatar */}
      <div className="px-4 -mt-10 relative">
        <div className="relative w-24 h-24 rounded-full border-4 border-[#0a090e] bg-zinc-800 overflow-hidden">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-amber-500 font-black text-2xl">
              {(displayName || user.username)?.[0]?.toUpperCase()}
            </div>
          )}
          <button
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/55 transition-colors disabled:opacity-70"
          >
            <span className="text-white text-[10px] font-bold">
              {avatarUploading ? '…' : 'Change'}
            </span>
          </button>
        </div>
        <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
        <p className="text-xs text-zinc-500 font-mono mt-2">JPG, PNG, WEBP up to 8MB</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="px-4 mt-6 space-y-5">
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
            Full Name
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, DISPLAY_NAME_MAX))}
            placeholder="Your name"
            className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 rounded-xl px-4 py-3 text-sm outline-none focus:border-amber-500/50"
          />
        </div>

        <div>
          <label className="block font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
            Username Handle
          </label>
          <div className="w-full bg-zinc-900/60 border border-zinc-800 text-zinc-400 rounded-xl px-4 py-3 text-sm">
            @{user.username}
          </div>
          <p className="text-[11px] text-zinc-600 mt-1.5">
            Your unique handle — this is how people find you. Handle changes aren't supported yet.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Bio</label>
            <span className="font-mono text-[10px] text-zinc-600">
              {bio.length}/{BIO_MAX}
            </span>
          </div>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
            placeholder="Tell people about yourself"
            rows={3}
            className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 rounded-xl px-4 py-3 text-sm outline-none focus:border-amber-500/50 resize-none"
          />
        </div>
      </form>
    </main>
  );
}
