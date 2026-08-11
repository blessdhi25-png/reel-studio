'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { LoadingSpinner } from '../../../components/LoadingScreen';

function centsToDollars(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function ArtistHubPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    load();
  }, [router]);

  function load() {
    setLoading(true);
    api
      .getMyArtistProfile()
      .then((p) => {
        setProfile(p);
        return api.getMyTracks();
      })
      .then(setTracks)
      .catch((err) => {
        if (err.message === 'No artist profile yet') {
          router.push('/artist/register');
        } else {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('title', title.trim());
      // Real duration, read from the browser rather than guessed — helps
      // creators know clip length before they attach it to a reel.
      const duration = await readAudioDuration(file).catch(() => null);
      if (duration) formData.append('durationSeconds', String(Math.round(duration)));

      await api.uploadTrack(formData);
      setShowUpload(false);
      setTitle('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      load();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950">
        <LoadingSpinner label="Loading…" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950">
        <p className="text-red-400 text-sm">{error}</p>
      </main>
    );
  }

  const totalUses = tracks.reduce((sum, t) => sum + t.useCount, 0);
  const totalTips = tracks.reduce((sum, t) => sum + t.tipsOnReelsUsingTrackCents, 0);

  return (
    <main className="min-h-screen bg-zinc-950 text-white px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <a href="/studio" className="text-xs text-zinc-500 uppercase tracking-widest hover:text-zinc-300">
          ← Back to Studio
        </a>

        <div className="flex items-start justify-between mt-6 mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-extrabold">{profile.stageName}</h1>
            <p className="text-zinc-400 text-sm mt-1">
              {profile.genre} · {profile.labelStatus === 'signed' ? 'Signed' : 'Independent'}
            </p>
            <div className="flex gap-3 mt-2">
              {profile.spotifyUrl && (
                <a href={profile.spotifyUrl} target="_blank" rel="noreferrer" className="text-xs text-amber-400 hover:text-amber-300">
                  Spotify
                </a>
              )}
              {profile.appleMusicUrl && (
                <a href={profile.appleMusicUrl} target="_blank" rel="noreferrer" className="text-xs text-amber-400 hover:text-amber-300">
                  Apple Music
                </a>
              )}
              {profile.youtubeUrl && (
                <a href={profile.youtubeUrl} target="_blank" rel="noreferrer" className="text-xs text-amber-400 hover:text-amber-300">
                  YouTube
                </a>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg shrink-0"
          >
            + Upload track
          </button>
        </div>

        {/* Analytics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="rounded-2xl p-5 bg-zinc-900/70 border border-zinc-800">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Tracks distributed</p>
            <p className="text-2xl font-bold">{tracks.length}</p>
          </div>
          <div className="rounded-2xl p-5 bg-zinc-900/70 border border-zinc-800">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Total uses in reels</p>
            <p className="text-2xl font-bold">{totalUses}</p>
          </div>
          <div className="rounded-2xl p-5 bg-gradient-to-br from-amber-500/15 to-transparent border border-amber-500/30">
            <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Tips on reels using your tracks</p>
            <p className="text-2xl font-bold text-amber-400">{centsToDollars(totalTips)}</p>
            <p className="text-[11px] text-zinc-500 mt-1">
              Informational only — tips still pay out to the creator who posted the reel, not to you automatically.
            </p>
          </div>
        </div>

        {/* Track list */}
        <h2 className="text-lg font-semibold mb-4">Your tracks</h2>
        {tracks.length === 0 && (
          <div className="rounded-2xl p-8 bg-zinc-900/50 border border-zinc-800 text-center">
            <p className="text-zinc-400 text-sm">No tracks yet — upload one for creators to use in their reels.</p>
          </div>
        )}
        <div className="space-y-3">
          {tracks.map((t) => (
            <div key={t.id} className="rounded-2xl p-4 bg-zinc-900/70 border border-zinc-800 flex items-center gap-4">
              <audio src={t.audioUrl} controls className="h-9 flex-1 min-w-0" />
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-white">{t.title}</p>
                <p className="text-[11px] text-zinc-500">
                  {t.useCount} uses · {centsToDollars(t.tipsOnReelsUsingTrackCents)} in tips
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <form
            onSubmit={handleUpload}
            className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Upload track</h2>
              <button type="button" onClick={() => setShowUpload(false)} className="text-zinc-400 hover:text-white text-xl leading-none">
                ✕
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Track title</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Sacrifice (Instrumental)"
                className="mt-1.5 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Audio file</label>
              <input
                ref={fileInputRef}
                required
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="mt-1.5 w-full text-xs text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:text-white file:text-xs"
              />
              <p className="text-[11px] text-zinc-600 mt-1">MP3, WAV, M4A, or AAC — up to 25MB</p>
            </div>

            {uploadError && <p className="text-sm text-red-400">{uploadError}</p>}

            <button
              type="submit"
              disabled={uploading || !file || !title.trim()}
              className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-3 rounded-xl transition-all disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Upload & distribute'}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}

function readAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    });
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read audio duration'));
    });
  });
}
