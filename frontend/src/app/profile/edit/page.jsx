'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, ImagePlus } from 'lucide-react';
import { api, getStoredUser } from '@/lib/api';

export default function EditProfilePage() {
  const router = useRouter();
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  const [userId, setUserId] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [bannerUrl, setBannerUrl] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored?.id) {
      router.replace('/login');
      return;
    }
    setUserId(stored.id);

    api
      .getUser(stored.id)
      .then((u) => {
        setDisplayName(u.displayName || '');
        setBio(u.bio || '');
        setAvatarUrl(u.avatarUrl || null);
        setBannerUrl(u.bannerUrl || null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  // Avatar/banner upload separately from text fields, immediately on pick —
  // matches how the dedicated /users/me/avatar and /users/me/banner
  // endpoints work (multipart, isForm: true so the browser sets its own
  // Content-Type boundary rather than us forcing application/json onto a
  // file upload). Saving displayName/bio is a separate JSON PATCH below.
  async function handleAvatarPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const updated = await api.uploadAvatar(formData);
      setAvatarUrl(updated.avatarUrl);
      syncStoredUser({ avatarUrl: updated.avatarUrl });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleBannerPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBanner(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('banner', file);
      const updated = await api.uploadBanner(formData);
      setBannerUrl(updated.bannerUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingBanner(false);
    }
  }

  function syncStoredUser(patch) {
    const stored = getStoredUser();
    if (stored) {
      localStorage.setItem('user', JSON.stringify({ ...stored, ...patch }));
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateProfile({ displayName: displayName.trim(), bio: bio.trim() });
      syncStoredUser({ displayName: updated.displayName });
      router.push(`/profile/${userId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a090e] text-white flex items-center justify-center">
        <p className="text-xs text-zinc-500 font-mono">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a090e] text-white pb-24 font-sans max-w-md mx-auto">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-900">
        <button onClick={() => router.back()} className="text-zinc-300 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-base font-bold">Edit profile</h1>
      </div>

      {/* Banner + avatar */}
      <div className="relative">
        <button
          type="button"
          onClick={() => bannerInputRef.current?.click()}
          disabled={uploadingBanner}
          className="w-full h-32 bg-zinc-900 relative overflow-hidden block disabled:opacity-60"
        >
          {bannerUrl && <img src={bannerUrl} alt="" className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center gap-1.5 text-xs font-semibold text-white">
            <ImagePlus size={14} />
            {uploadingBanner ? 'Uploading…' : 'Change banner'}
          </div>
        </button>
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleBannerPick}
        />

        <button
          type="button"
          onClick={() => avatarInputRef.current?.click()}
          disabled={uploadingAvatar}
          className="absolute -bottom-8 left-4 w-20 h-20 rounded-full border-4 border-[#0a090e] bg-zinc-900 overflow-hidden flex items-center justify-center disabled:opacity-60"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-amber-500 font-black text-xl">
              {(displayName || '?')[0]?.toUpperCase()}
            </span>
          )}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Camera size={16} className="text-white" />
          </div>
        </button>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarPick}
        />
      </div>

      <form onSubmit={handleSave} className="px-4 pt-12 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Display name
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={60}
            className="w-full bg-zinc-900 border border-zinc-800 text-white text-sm rounded-xl px-3.5 py-3 outline-none focus:border-amber-500/60"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Bio
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 150))}
            rows={3}
            maxLength={150}
            className="w-full bg-zinc-900 border border-zinc-800 text-white text-sm rounded-xl px-3.5 py-3 outline-none focus:border-amber-500/60 resize-none"
          />
          <p className="text-right text-[10px] text-zinc-600 mt-1">{bio.length}/150</p>
        </div>

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-xl bg-amber-500 text-black text-sm font-extrabold uppercase tracking-wider hover:bg-amber-400 transition-all disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
