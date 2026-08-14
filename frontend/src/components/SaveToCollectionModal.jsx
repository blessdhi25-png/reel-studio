'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';

const PRIVACY_OPTIONS = [
  { value: 'private', icon: '🔒', label: 'Private' },
  { value: 'collaborators', icon: '👥', label: 'Collaborators' },
  { value: 'public', icon: '🌐', label: 'Public' },
];

function Switch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative w-10 h-6 rounded-full shrink-0 transition-colors disabled:opacity-50 ${
        checked ? 'bg-amber-500' : 'bg-zinc-700'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// Triggered from the Bookmark icon on a video card or full-screen reel.
// Lets someone toggle a video in/out of any of their existing collections,
// or quick-create a new one on the fly — see VideoCard.jsx's bookmark
// button, which opens this instead of an instant single-collection toggle.
//
// isQuickSaved/onQuickSaveToggle are optional: when passed, a pinned
// "Quick Save" row appears above the named collections, wired to the
// existing simple Bookmark relation (the same one that's always powered
// the profile page's "Saved" tab) — so tapping the bookmark icon still
// keeps that one-tap save working exactly as before, and named
// collections are purely an additional way to organize on top of it.
export default function SaveToCollectionModal({ videoId, isQuickSaved, onQuickSaveToggle, onClose, onSaved }) {
  const toast = useToast();
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState(new Set());

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrivacy, setNewPrivacy] = useState('private');
  const [creating, setCreating] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);

  async function handleQuickSaveToggle() {
    if (!onQuickSaveToggle || quickSaving) return;
    setQuickSaving(true);
    try {
      await onQuickSaveToggle();
    } finally {
      setQuickSaving(false);
    }
  }

  function load() {
    setLoading(true);
    api
      .getCollections({ tab: 'mine', videoId })
      .then(setCollections)
      .catch(() => setCollections([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  async function handleToggle(collection) {
    setBusyIds((prev) => new Set(prev).add(collection.id));
    const willSave = !collection.isSaved;
    setCollections((prev) =>
      prev.map((c) =>
        c.id === collection.id ? { ...c, isSaved: willSave, itemCount: c.itemCount + (willSave ? 1 : -1) } : c
      )
    );
    try {
      await api.toggleSaveToCollection(collection.id, videoId);
      toast.success(willSave ? `Saved to ${collection.name}` : `Removed from ${collection.name}`);
      onSaved?.(collection, willSave);
    } catch (err) {
      setCollections((prev) =>
        prev.map((c) =>
          c.id === collection.id ? { ...c, isSaved: !willSave, itemCount: c.itemCount + (willSave ? -1 : 1) } : c
        )
      );
      toast.error(err.message || 'Could not update this collection');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(collection.id);
        return next;
      });
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const created = await api.createCollection({ name: newName.trim(), privacy: newPrivacy });
      // New collection never has this video in it yet — save it
      // immediately so "create + save" is one motion, not two.
      await api.toggleSaveToCollection(created.id, videoId);
      setCollections((prev) => [{ ...created, isSaved: true, itemCount: 1 }, ...prev]);
      toast.success(`Saved to ${created.name}`);
      onSaved?.(created, true);
      setNewName('');
      setNewPrivacy('private');
      setShowCreate(false);
    } catch (err) {
      toast.error(err.message || 'Could not create collection');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        className="w-full sm:max-w-md sm:mx-4 max-h-[85vh] bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 text-white rounded-t-3xl sm:rounded-2xl flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
          <p className="font-display text-lg tracking-wide">Save to Collection</p>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-sm">
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {typeof isQuickSaved === 'boolean' && (
            <button
              type="button"
              onClick={handleQuickSaveToggle}
              disabled={quickSaving}
              className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-zinc-800/60 transition-colors text-left disabled:opacity-50 border border-zinc-800 mb-2"
            >
              <span className="w-11 h-11 rounded-xl bg-zinc-800 flex items-center justify-center text-lg shrink-0">
                🔖
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-white">Quick Save</span>
                <span className="block text-xs text-zinc-500 mt-0.5">Your general Saved tab</span>
              </span>
              <Switch checked={isQuickSaved} onChange={handleQuickSaveToggle} disabled={quickSaving} />
            </button>
          )}

          {loading && (
            <p className="text-center text-zinc-500 text-sm py-8">Loading your collections…</p>
          )}

          {!loading && collections.length === 0 && !showCreate && (
            <p className="text-center text-zinc-500 text-sm py-8">
              You don't have any collections yet — create one below.
            </p>
          )}

          {!loading &&
            collections.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleToggle(c)}
                disabled={busyIds.has(c.id)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-zinc-800/60 transition-colors text-left disabled:opacity-50"
              >
                <span className="w-11 h-11 rounded-xl bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 grid grid-cols-2 grid-rows-2">
                  {c.previewThumbnails.length > 0 ? (
                    c.previewThumbnails
                      .slice(0, 4)
                      .map((src, i) => <img key={i} src={src} alt="" className="w-full h-full object-cover" />)
                  ) : (
                    <span className="col-span-2 row-span-2 flex items-center justify-center text-zinc-600 text-lg">
                      📁
                    </span>
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-white truncate">{c.name}</span>
                  <span className="block text-xs text-zinc-500 mt-0.5">
                    {c.itemCount} {c.itemCount === 1 ? 'video' : 'videos'} ·{' '}
                    {c.privacy === 'private' ? '🔒 Private' : c.privacy === 'public' ? '🌐 Public' : '👥 Shared'}
                  </span>
                </span>
                <Switch checked={Boolean(c.isSaved)} onChange={() => handleToggle(c)} disabled={busyIds.has(c.id)} />
              </button>
            ))}

          {!showCreate ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-zinc-800/60 transition-colors text-left mt-2"
            >
              <span className="w-11 h-11 rounded-xl border-2 border-dashed border-zinc-700 flex items-center justify-center text-zinc-500 text-xl shrink-0">
                +
              </span>
              <span className="text-sm font-semibold text-amber-400">New Collection</span>
            </button>
          ) : (
            <form onSubmit={handleCreate} className="mt-2 p-3 rounded-2xl bg-zinc-800/40 border border-zinc-800 space-y-3">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Collection name"
                maxLength={60}
                className="w-full bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500/50"
              />
              <div className="grid grid-cols-3 gap-2">
                {PRIVACY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNewPrivacy(opt.value)}
                    className={`p-2 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-colors ${
                      newPrivacy === opt.value
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                        : 'bg-zinc-800/60 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    <span className="text-base leading-none">{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 text-xs font-semibold hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim() || creating}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create & Save'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
