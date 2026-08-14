'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';

const PRIVACY_OPTIONS = [
  { value: 'private', label: 'Private', icon: '🔒', hint: 'Only you can see this' },
  { value: 'shared', label: 'Collaborators Only', icon: '👥', hint: 'You and people you invite' },
  { value: 'public', label: 'Public', icon: '🌐', hint: 'Anyone can find and view this' },
];

function privacyIcon(privacy) {
  return PRIVACY_OPTIONS.find((p) => p.value === privacy)?.icon || '🔒';
}

// Triggered by the Bookmark icon on a video card / feed reel. Bookmark
// itself stays a separate, flat "saved for later" flag (see the Bookmark
// model comment in schema.prisma) — untouched by this, still driving the
// bookmark icon's fill state and count everywhere else in the app. This
// modal's checkboxes are additive: a video can be plain-bookmarked, in any
// number of named collections, both, or neither, independently.
export default function SaveToCollectionModal({ videoId, onClose, quickSaved, onQuickSaveToggle }) {
  const toast = useToast();
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savedSet, setSavedSet] = useState(new Set());
  const [pendingIds, setPendingIds] = useState(new Set());

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrivacy, setNewPrivacy] = useState('private');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getCollections(videoId)
      .then((list) => {
        if (cancelled) return;
        // Only collections this person can actually add to — a public
        // collection they don't own or collaborate on shows up in the hub's
        // "Public Collections" tab, but isn't a valid save target here (the
        // backend would 403 it anyway; filtering client-side just avoids
        // showing a toggle that can't work).
        const editable = list.filter((c) => c.role === 'owner' || c.role === 'collaborator');
        setCollections(editable);
        setSavedSet(new Set(editable.filter((c) => c.savedHere).map((c) => c.id)));
      })
      .catch(() => toast.error("Couldn't load your collections"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  async function toggleCollection(collection) {
    if (pendingIds.has(collection.id)) return;
    setPendingIds((prev) => new Set(prev).add(collection.id));
    const wasSaved = savedSet.has(collection.id);
    // Optimistic — flip immediately, revert on failure.
    setSavedSet((prev) => {
      const next = new Set(prev);
      wasSaved ? next.delete(collection.id) : next.add(collection.id);
      return next;
    });

    try {
      const { saved } = await api.saveToCollection(collection.id, videoId);
      if (saved) {
        toast.success(`Saved to ${collection.name}`);
      } else {
        toast.info(`Removed from ${collection.name}`);
      }
    } catch (err) {
      setSavedSet((prev) => {
        const next = new Set(prev);
        wasSaved ? next.add(collection.id) : next.delete(collection.id);
        return next;
      });
      toast.error(err.message || "Couldn't update that");
    } finally {
      setPendingIds((prev) => {
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
      setCollections((prev) => [created, ...prev]);
      setNewName('');
      setShowCreate(false);
      // Saving into a folder you just created in the same flow is the
      // obvious intent — do it immediately instead of leaving the person
      // to find and tap the row they only just made.
      await toggleCollection(created);
    } catch (err) {
      toast.error(err.message || "Couldn't create that collection");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm sm:mx-4 max-h-[80vh] bg-zinc-900 border border-zinc-800 text-white rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <p className="font-semibold text-base">Save to collection</p>
          <button onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-white text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {/* Optional — VideoCard passes this so the bookmark icon's own
              fill state/count (backed by the separate, flat Bookmark model
              — see schema.prisma) has a way to still be toggled from here,
              now that tapping the icon opens this modal instead of
              instantly saving. Omitted entirely when this modal is opened
              from somewhere with no single "this video" bookmark context,
              e.g. a future add-to-collection flow from the Collections hub. */}
          {onQuickSaveToggle && (
            <button
              onClick={onQuickSaveToggle}
              className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-zinc-800/60 text-left mb-1"
            >
              <span className="w-11 h-11 rounded-xl bg-zinc-800 shrink-0 flex items-center justify-center text-lg">
                🔖
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-white">Quick save</span>
                <span className="block text-xs text-zinc-500">Not in a collection — just saved</span>
              </span>
              <span
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  quickSaved ? 'bg-amber-500 border-amber-500 text-black' : 'border-zinc-600'
                }`}
              >
                {quickSaved && '✓'}
              </span>
            </button>
          )}
          {onQuickSaveToggle && <div className="h-px bg-zinc-800 my-1 mx-2" />}

          {loading && (
            <div className="flex flex-col gap-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-2.5">
                  <span className="w-11 h-11 rounded-xl bg-zinc-800 animate-pulse shrink-0" />
                  <span className="flex-1 space-y-2">
                    <span className="block h-3.5 w-1/2 rounded bg-zinc-800 animate-pulse" />
                    <span className="block h-3 w-1/3 rounded bg-zinc-800 animate-pulse" />
                  </span>
                </div>
              ))}
            </div>
          )}

          {!loading && collections.length === 0 && !showCreate && (
            <p className="text-sm text-zinc-500 text-center py-8">
              You don't have any collections yet — create one below.
            </p>
          )}

          {!loading &&
            collections.map((c) => {
              const saved = savedSet.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCollection(c)}
                  disabled={pendingIds.has(c.id)}
                  className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-zinc-800/60 text-left disabled:opacity-60"
                >
                  <span className="w-11 h-11 rounded-xl overflow-hidden bg-zinc-800 shrink-0 grid grid-cols-2 grid-rows-2">
                    {c.previewThumbnails?.length ? (
                      c.previewThumbnails
                        .slice(0, 4)
                        .map((url, i) => <img key={i} src={url} alt="" className="w-full h-full object-cover" />)
                    ) : (
                      <span className="col-span-2 row-span-2 flex items-center justify-center text-zinc-600 text-lg">🎬</span>
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-white truncate">{c.name}</span>
                    <span className="block text-xs text-zinc-500">
                      {privacyIcon(c.privacy)} {c.videoCount} video{c.videoCount === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      saved ? 'bg-amber-500 border-amber-500 text-black' : 'border-zinc-600'
                    }`}
                  >
                    {saved && '✓'}
                  </span>
                </button>
              );
            })}
        </div>

        <div className="px-3 pb-3 pt-1 border-t border-zinc-800 shrink-0">
          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full flex items-center gap-2 px-3 py-3 rounded-xl text-amber-400 font-semibold text-sm hover:bg-zinc-800/60"
            >
              + Create new collection
            </button>
          ) : (
            <form onSubmit={handleCreate} className="p-2 space-y-2.5">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Collection name"
                maxLength={80}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 outline-none focus:ring-2 focus:ring-amber-500/50"
              />
              <div className="flex gap-1.5">
                {PRIVACY_OPTIONS.map((p) => (
                  <button
                    type="button"
                    key={p.value}
                    onClick={() => setNewPrivacy(p.value)}
                    title={p.hint}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border ${
                      newPrivacy === p.value ? 'bg-amber-500 text-black border-amber-500' : 'border-zinc-700 text-zinc-300'
                    }`}
                  >
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-zinc-300 border border-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim() || creating}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 text-black disabled:opacity-40"
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
