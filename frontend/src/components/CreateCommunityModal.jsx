'use client';

import { useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';

export const COMMUNITY_CATEGORIES = ['Tech', 'Gaming', 'Music', 'Film', 'Fitness', 'Art', 'Sports', 'Other'];

export default function CreateCommunityModal({ onClose, onCreated }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(COMMUNITY_CATEGORIES[0]);
  const [privacy, setPrivacy] = useState('public');
  const [bannerUrl, setBannerUrl] = useState('');
  const [rules, setRules] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const created = await api.createCommunity({
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        privacy,
        bannerUrl: bannerUrl.trim() || undefined,
        rules: rules.trim() || undefined,
      });
      toast.success(`"${created.name}" created`);
      onCreated?.(created);
    } catch (err) {
      toast.error(err.message || 'Could not create community');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        className="w-full sm:max-w-md sm:mx-4 max-h-[88vh] bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 text-white rounded-t-3xl sm:rounded-2xl flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
          <p className="font-display text-lg tracking-wide">Create Community</p>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-sm">
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 block">
              Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Indie Filmmakers"
              maxLength={60}
              className="w-full bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 block">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this community about?"
              maxLength={280}
              rows={3}
              className="w-full bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500/50 resize-none"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 block">
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {COMMUNITY_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    category === c
                      ? 'bg-amber-500 text-black'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 block">
              Privacy
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPrivacy('public')}
                className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-colors ${
                  privacy === 'public'
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                    : 'bg-zinc-800/60 border-zinc-700 text-zinc-400'
                }`}
              >
                <span className="text-base leading-none">🌐</span>
                Public
              </button>
              <button
                type="button"
                onClick={() => setPrivacy('private')}
                className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-colors ${
                  privacy === 'private'
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                    : 'bg-zinc-800/60 border-zinc-700 text-zinc-400'
                }`}
              >
                <span className="text-base leading-none">🔒</span>
                Private / Invite-Only
              </button>
            </div>
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 block">
              Banner Image URL <span className="normal-case text-zinc-600">(optional)</span>
            </label>
            <input
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              placeholder="https://…"
              className="w-full bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 block">
              Rules <span className="normal-case text-zinc-600">(optional)</span>
            </label>
            <textarea
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              placeholder={'1. Be respectful\n2. No spam\n3. Stay on topic'}
              maxLength={2000}
              rows={4}
              className="w-full bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500/50 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim() || busy}
            className="w-full py-3 rounded-xl bg-amber-500 text-black text-sm font-bold hover:bg-amber-400 disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create Community'}
          </button>
        </form>
      </div>
    </div>
  );
}
