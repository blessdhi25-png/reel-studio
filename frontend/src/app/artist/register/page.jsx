'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

const GENRES = ['Hip-Hop', 'Pop', 'R&B', 'Electronic', 'Rock', 'Afrobeats', 'Country', 'Jazz', 'Classical', 'Other'];

export default function ArtistRegisterPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState({
    stageName: '',
    genre: GENRES[0],
    spotifyUrl: '',
    appleMusicUrl: '',
    youtubeUrl: '',
    managementEmail: '',
    labelStatus: 'independent',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    // Already registered? Send them straight to the hub instead of letting
    // them fill out the form again.
    api
      .getMyArtistProfile()
      .then(() => router.push('/studio/artists'))
      .catch(() => setChecking(false));
  }, [router]);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.registerArtist(form);
      router.push('/studio/artists');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950">
        <p className="text-zinc-500 text-sm">Checking…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white px-6 py-10">
      <div className="max-w-lg mx-auto">
        <a href="/studio" className="text-xs text-zinc-500 uppercase tracking-widest hover:text-zinc-300">
          ← Back to Studio
        </a>

        <h1 className="text-3xl font-extrabold mt-6 mb-1">Reel for Artists</h1>
        <p className="text-zinc-400 text-sm mb-8">
          Claim your artist account to distribute official tracks that other creators can use in their reels.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label="Artist / Stage Name">
            <input
              required
              value={form.stageName}
              onChange={update('stageName')}
              placeholder="e.g. Bless Dhi"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </Field>

          <Field label="Primary Genre">
            <select
              value={form.genre}
              onChange={update('genre')}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
            >
              {GENRES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </Field>

          <Field label="Spotify link" optional>
            <input
              value={form.spotifyUrl}
              onChange={update('spotifyUrl')}
              placeholder="https://open.spotify.com/artist/…"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </Field>

          <Field label="Apple Music link" optional>
            <input
              value={form.appleMusicUrl}
              onChange={update('appleMusicUrl')}
              placeholder="https://music.apple.com/artist/…"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </Field>

          <Field label="YouTube link" optional>
            <input
              value={form.youtubeUrl}
              onChange={update('youtubeUrl')}
              placeholder="https://youtube.com/@…"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </Field>

          <Field label="Management contact email" optional>
            <input
              type="email"
              value={form.managementEmail}
              onChange={update('managementEmail')}
              placeholder="manager@label.com"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </Field>

          <Field label="Label status">
            <div className="flex gap-2">
              {[
                { value: 'independent', label: 'Independent' },
                { value: 'signed', label: 'Signed to a label' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, labelStatus: opt.value }))}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                    form.labelStatus === opt.value
                      ? 'bg-amber-500 text-black border-amber-500'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-3 rounded-xl transition-all disabled:opacity-50"
          >
            {submitting ? 'Setting up…' : 'Claim my artist account'}
          </button>
        </form>
      </div>
    </main>
  );
}

function Field({ label, optional, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
        {label} {optional && <span className="normal-case text-zinc-600">(optional)</span>}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
