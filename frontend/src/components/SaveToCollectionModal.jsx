'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';

function XIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

function CheckIcon(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function BookmarkIcon({ filled, ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? '#ef4444' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="2" {...props}>
      <path d="M6 2h12a1 1 0 0 1 1 1v19l-7-4.5L5 22V3a1 1 0 0 1 1-1z" />
    </svg>
  );
}

function FolderPlusIcon(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2z" />
      <path d="M12 11v6M9 14h6" />
    </svg>
  );
}

function SpinnerIcon(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin" {...props}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const PRIVACY_OPTIONS = [
  { id: 'private', label: 'Private', hint: 'Only you', icon: '🔒' },
  { id: 'public', label: 'Public', hint: 'Anyone can view', icon: '🌐' },
  { id: 'collaborators', label: 'Collaborators Only', hint: 'You + people you invite', icon: '👥' },
];

/**
 * Save-to-collection modal, triggered from a video's bookmark icon.
 *
 * Props:
 *  - open, onClose
 *  - videoId: string — the video being saved
 *  - isBookmarked: boolean — the video's current plain-bookmark state (the
 *    quick single-tap save, separate from named collections — see the big
 *    comment on the Collection model in schema.prisma for why these are
 *    two coexisting systems). Shown here as a "Quick Save" row so both
 *    ways of saving something live in one place.
 *  - onQuickSaveChange?: (next: boolean) => void — called when Quick Save
 *    is toggled from inside this modal, so the VideoCard that opened it
 *    can keep its own bookmarked/bookmarkCount state in sync rather than
 *    going stale.
 */
export default function SaveToCollectionModal({ open, onClose, videoId, isBookmarked, onQuickSaveChange }) {
  const toast = useToast();
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingIds, setSavingIds] = useState(() => new Set());

  const [quickSaved, setQuickSaved] = useState(Boolean(isBookmarked));
  const [quickSaving, setQuickSaving] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrivacy, setNewPrivacy] = useState('private');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setQuickSaved(Boolean(isBookmarked));
    setShowCreate(false);
    setError(null);
    setLoading(true);
    api
      .getCollections('mine', videoId)
      .then(setCollections)
      .catch((err) => setError(err.message || 'Could not load your collections.'))
      .finally(() => setLoading(false));
    // isBookmarked deliberately excluded — it's only meant to seed state
    // when the modal opens, not resync every time the parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, videoId]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.();
    }
    if (open) document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  async function toggleQuickSave() {
    if (quickSaving) return;
    const next = !quickSaved;
    setQuickSaving(true);
    setQuickSaved(next);
    try {
      next ? await api.bookmarkVideo(videoId) : await api.unbookmarkVideo(videoId);
      onQuickSaveChange?.(next);
      toast.success(next ? 'Saved' : 'Removed from Saved');
    } catch {
      setQuickSaved(!next);
    } finally {
      setQuickSaving(false);
    }
  }

  async function toggleCollection(collection) {
    if (savingIds.has(collection.id)) return;
    const next = !collection.isSaved;

    setSavingIds((prev) => new Set(prev).add(collection.id));
    setCollections((prev) => prev.map((c) => (c.id === collection.id ? { ...c, isSaved: next } : c)));

    try {
      await api.saveToCollection(collection.id, videoId);
      toast[next ? 'success' : 'info'](next ? `Saved to ${collection.name}` : `Removed from ${collection.name}`);
    } catch {
      setCollections((prev) => prev.map((c) => (c.id === collection.id ? { ...c, isSaved: !next } : c)));
      toast.error("Couldn't update that collection — try again.");
    } finally {
      setSavingIds((prev) => {
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
    setCreateError(null);
    try {
      const created = await api.createCollection({ name: newName.trim(), privacy: newPrivacy });
      await api.saveToCollection(created.id, videoId);
      setCollections((prev) => [{ ...created, isSaved: true }, ...prev]);
      toast.success(`Saved to ${created.name}`);
      setNewName('');
      setNewPrivacy('private');
      setShowCreate(false);
    } catch (err) {
      setCreateError(err.message || 'Could not create that collection.');
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Save to collection"
        className="relative w-full sm:w-[420px] max-h-[85vh] bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 sm:rounded-2xl rounded-t-2xl text-white flex flex-col shadow-2xl animate-[slideUp_0.24s_cubic-bezier(0.16,1,0.3,1)]"
      >
        <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-3 border-b border-zinc-800">
          <h2 className="text-base font-bold">Save to…</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 -m-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
          >
            <XIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
          {/* Quick Save — the existing plain-bookmark toggle, surfaced here
              alongside named collections so there's one place to manage
              every way of saving this video. */}
          <button
            type="button"
            onClick={toggleQuickSave}
            disabled={quickSaving}
            className="w-full flex items-center gap-3 py-3 px-2 -mx-2 rounded-xl hover:bg-zinc-800/60 transition-all disabled:opacity-60"
          >
            <span className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
              <BookmarkIcon filled={quickSaved} className="w-5 h-5" />
            </span>
            <span className="flex-1 text-left">
              <span className="block text-sm font-semibold">Quick Save</span>
              <span className="block text-xs text-zinc-500">Not organized into a collection</span>
            </span>
            {quickSaving ? (
              <SpinnerIcon className="text-zinc-400" />
            ) : (
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${
                  quickSaved ? 'bg-white border-white' : 'border-zinc-600'
                }`}
              >
                {quickSaved && <CheckIcon className="text-zinc-900" />}
              </span>
            )}
          </button>

          <div className="h-px bg-zinc-800 my-2" />

          {loading && (
            <div className="space-y-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 py-3 px-2 animate-pulse">
                  <div className="w-10 h-10 rounded-xl bg-zinc-800" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-24 bg-zinc-800 rounded-full" />
                    <div className="h-2.5 w-16 bg-zinc-800 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-red-400 py-3">{error}</p>}

          {!loading && !error && collections.length === 0 && !showCreate && (
            <p className="text-sm text-zinc-500 py-4 text-center">
              You don't have any collections yet. Create one below.
            </p>
          )}

          {!loading &&
            collections.map((c) => {
              const saving = savingIds.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCollection(c)}
                  disabled={saving}
                  className="w-full flex items-center gap-3 py-3 px-2 -mx-2 rounded-xl hover:bg-zinc-800/60 transition-all disabled:opacity-60"
                >
                  <span className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 grid grid-cols-2 grid-rows-2">
                    {c.coverThumbnails?.length ? (
                      c.coverThumbnails
                        .slice(0, 4)
                        .map((url, i) => <img key={i} src={url} alt="" className="w-full h-full object-cover" />)
                    ) : (
                      <span className="col-span-2 row-span-2 flex items-center justify-center text-zinc-600 text-xs">
                        📁
                      </span>
                    )}
                  </span>
                  <span className="flex-1 text-left min-w-0">
                    <span className="block text-sm font-semibold truncate">{c.name}</span>
                    <span className="block text-xs text-zinc-500">
                      {c.videoCount} video{c.videoCount === 1 ? '' : 's'} ·{' '}
                      {c.privacy === 'private' ? '🔒 Private' : c.privacy === 'public' ? '🌐 Public' : '👥 Shared'}
                    </span>
                  </span>
                  {saving ? (
                    <SpinnerIcon className="text-zinc-400" />
                  ) : (
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${
                        c.isSaved ? 'bg-white border-white' : 'border-zinc-600'
                      }`}
                    >
                      {c.isSaved && <CheckIcon className="text-zinc-900" />}
                    </span>
                  )}
                </button>
              );
            })}
        </div>

        {/* Quick create */}
        <div className="shrink-0 border-t border-zinc-800 px-5 py-4">
          {!showCreate ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 text-sm font-semibold transition-all"
            >
              <FolderPlusIcon className="w-5 h-5" /> New Collection
            </button>
          ) : (
            <form onSubmit={handleCreate} className="space-y-3">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Collection name"
                maxLength={60}
                className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all placeholder:text-zinc-500"
              />
              <div className="flex gap-1.5">
                {PRIVACY_OPTIONS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setNewPrivacy(p.id)}
                    className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl border text-[11px] font-semibold transition-all ${
                      newPrivacy === p.id
                        ? 'bg-amber-500 border-amber-500 text-black'
                        : 'bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <span>{p.icon}</span>
                    {p.label}
                  </button>
                ))}
              </div>
              {createError && <p className="text-xs text-red-400">{createError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-semibold hover:bg-zinc-800 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim() || creating}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-all disabled:opacity-40"
                >
                  {creating && <SpinnerIcon />}
                  {creating ? 'Creating…' : 'Create & Save'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideUp {
          from { transform: translateY(24px); opacity: 0.4; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
