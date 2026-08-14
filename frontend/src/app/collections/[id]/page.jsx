'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { useToast } from '../../../context/ToastContext';
import { LoadingSpinner } from '../../../components/LoadingScreen';
import VideoCard from '../../../components/VideoCard';

const PRIVACY_OPTIONS = [
  { value: 'private', icon: '🔒', label: 'Private' },
  { value: 'collaborators', icon: '👥', label: 'Collaborators' },
  { value: 'public', icon: '🌐', label: 'Public' },
];

const PRIVACY_BADGE = {
  private: '🔒 Private',
  public: '🌐 Public',
  collaborators: '👥 Shared',
};

function Avatar({ user, size = 'w-9 h-9' }) {
  return (
    <span className={`${size} rounded-full bg-zinc-700 overflow-hidden flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0`}>
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        user?.username?.[0]?.toUpperCase()
      )}
    </span>
  );
}

// Collaborator invite/manage drawer — searches users by username (reusing
// the same /search endpoint the global search bar uses) rather than a
// dedicated collections-only lookup.
function CollaboratorsDrawer({ collection, isOwner, onClose, onAdded, onRemoved }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busyIds, setBusyIds] = useState(new Set());

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      api
        .search(query.trim())
        .then((res) => setResults(res.users || []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function handleAdd(user) {
    setBusyIds((prev) => new Set(prev).add(user.id));
    try {
      await api.addCollectionCollaborator(collection.id, user.id);
      toast.success(`@${user.username} can now co-curate this collection`);
      onAdded?.(user);
      setQuery('');
      setResults([]);
    } catch (err) {
      toast.error(err.message || 'Could not add collaborator');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(user.id);
        return next;
      });
    }
  }

  async function handleRemove(userId) {
    setBusyIds((prev) => new Set(prev).add(userId));
    try {
      await api.removeCollectionCollaborator(collection.id, userId);
      onRemoved?.(userId);
    } catch (err) {
      toast.error(err.message || 'Could not remove collaborator');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }

  const existingIds = new Set(collection.collaborators.map((c) => c.id));

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        className="w-full sm:max-w-md sm:mx-4 max-h-[85vh] bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 text-white rounded-t-3xl sm:rounded-2xl flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
          <p className="font-display text-lg tracking-wide">Collaborators</p>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-sm">
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isOwner && (
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 block">
                Invite a co-curator
              </label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by username…"
                className="w-full bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500/50"
              />
              {searching && <p className="text-xs text-zinc-600 mt-2">Searching…</p>}
              {!searching && results.length > 0 && (
                <div className="mt-2 space-y-1">
                  {results
                    .filter((u) => !existingIds.has(u.id) && u.id !== collection.owner?.id)
                    .map((u) => (
                      <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-800/60">
                        <Avatar user={u} />
                        <span className="flex-1 text-sm text-white truncate">@{u.username}</span>
                        <button
                          onClick={() => handleAdd(u)}
                          disabled={busyIds.has(u.id)}
                          className="text-xs font-bold text-amber-400 hover:text-amber-300 disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">Can add & remove videos</p>
            <div className="space-y-1">
              <div className="flex items-center gap-3 p-2">
                <Avatar user={collection.owner} />
                <span className="flex-1 text-sm text-white truncate">@{collection.owner?.username}</span>
                <span className="font-mono text-[9px] uppercase tracking-widest text-amber-400 font-bold">Owner</span>
              </div>
              {collection.collaborators.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-2">
                  <Avatar user={c} />
                  <span className="flex-1 text-sm text-white truncate">@{c.username}</span>
                  {isOwner && (
                    <button
                      onClick={() => handleRemove(c.id)}
                      disabled={busyIds.has(c.id)}
                      className="text-xs text-rose-400 hover:text-rose-300 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {collection.collaborators.length === 0 && (
                <p className="text-xs text-zinc-600 px-2 py-1">No collaborators yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Full-screen vertical continuous reel — "Play All Feed". VideoCard
// autoplays purely from its own in-view IntersectionObserver (see
// useAutoPlayOnScroll), so stacking every saved video in one snap-scroll
// column is enough to get the same continuous-scroll playback as the main
// feed, without reimplementing its active-index tracking here.
function PlayAllOverlay({ videos, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-lg"
        aria-label="Close player"
      >
        ✕
      </button>
      <div className="feed-scroll h-full w-full overflow-y-scroll snap-y snap-mandatory">
        {videos.map((video) => (
          <div key={video.id} className="h-dvh w-full snap-start">
            <VideoCard video={video} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CollectionDetailPage({ params }) {
  const { id } = params;
  const router = useRouter();
  const toast = useToast();

  const [collection, setCollection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrivacy, setEditPrivacy] = useState('private');

  const [showCollaborators, setShowCollaborators] = useState(false);
  const [showPlayAll, setShowPlayAll] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  function load() {
    return api
      .getCollection(id)
      .then((c) => {
        setCollection(c);
        setEditName(c.name);
        setEditDescription(c.description || '');
        setEditPrivacy(c.privacy);
      })
      .catch(() => setNotFound(true));
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editName.trim() || editBusy) return;
    setEditBusy(true);
    try {
      const updated = await api.updateCollection(id, {
        name: editName.trim(),
        description: editDescription.trim(),
        privacy: editPrivacy,
      });
      setCollection((prev) => ({ ...prev, ...updated }));
      setEditing(false);
      toast.success('Collection updated');
    } catch (err) {
      toast.error(err.message || 'Could not update collection');
    } finally {
      setEditBusy(false);
    }
  }

  async function handleRemoveVideo(videoId) {
    setRemovingId(videoId);
    const prevVideos = collection.videos;
    setCollection((prev) => ({ ...prev, videos: prev.videos.filter((v) => v.id !== videoId), itemCount: prev.itemCount - 1 }));
    try {
      await api.toggleSaveToCollection(id, videoId);
    } catch (err) {
      setCollection((prev) => ({ ...prev, videos: prevVideos, itemCount: prevVideos.length }));
      toast.error(err.message || 'Could not remove this video');
    } finally {
      setRemovingId(null);
    }
  }

  async function handleDeleteCollection() {
    if (!window.confirm(`Delete "${collection.name}"? The videos in it won't be affected.`)) return;
    try {
      await api.deleteCollection(id);
      toast.success('Collection deleted');
      router.push('/collections');
    } catch (err) {
      toast.error(err.message || 'Could not delete this collection');
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <LoadingSpinner label="Loading…" />
      </main>
    );
  }

  if (notFound || !collection) {
    return (
      <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-6 text-center">
        <p className="font-body text-zinc-300 text-sm mb-1">Collection not found</p>
        <p className="font-body text-zinc-600 text-xs mb-5">It may be private, or no longer exists.</p>
        <a href="/collections" className="text-amber-400 text-sm font-semibold hover:text-amber-300">
          ← Back to Collections
        </a>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 pb-16">
      <div className="max-w-5xl mx-auto px-4 pt-6">
        <a href="/collections" className="font-mono text-xs text-zinc-500 hover:text-zinc-300">
          ← Collections
        </a>

        {/* Header & stats */}
        <div className="bg-zinc-900 border border-zinc-800 text-white rounded-2xl p-5 mt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-xl text-white tracking-wide truncate">{collection.name}</h1>
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 shrink-0">
                  {PRIVACY_BADGE[collection.privacy]}
                </span>
              </div>
              {collection.description && (
                <p className="font-body text-sm text-zinc-400 mt-2">{collection.description}</p>
              )}
            </div>
            {collection.isOwner && (
              <button
                onClick={() => setEditing((v) => !v)}
                className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-zinc-400 hover:text-white px-3 py-2 rounded-xl border border-zinc-700"
              >
                {editing ? 'Cancel' : 'Edit'}
              </button>
            )}
          </div>

          {editing && (
            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={60}
                className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500/50"
              />
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                maxLength={280}
                rows={2}
                className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500/50 resize-none"
              />
              <div className="grid grid-cols-3 gap-2">
                {PRIVACY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEditPrivacy(opt.value)}
                    className={`p-2 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 ${
                      editPrivacy === opt.value
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
                  type="submit"
                  disabled={editBusy}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 text-black text-sm font-bold disabled:opacity-50"
                >
                  {editBusy ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteCollection}
                  className="px-4 py-2.5 rounded-xl border border-rose-500/40 text-rose-400 text-xs font-bold hover:bg-rose-500/10"
                >
                  Delete
                </button>
              </div>
            </form>
          )}

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <Avatar user={collection.owner} />
                {collection.collaborators.slice(0, 4).map((c) => (
                  <span key={c.id} className="-ml-3">
                    <Avatar user={c} size="w-8 h-8" />
                  </span>
                ))}
              </div>
              <button
                onClick={() => setShowCollaborators(true)}
                className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 hover:text-white"
              >
                {collection.itemCount} {collection.itemCount === 1 ? 'save' : 'saves'} ·{' '}
                {collection.collaborators.length} {collection.collaborators.length === 1 ? 'collaborator' : 'collaborators'}
              </button>
            </div>
            {collection.videos.length > 0 && (
              <button
                onClick={() => setShowPlayAll(true)}
                className="bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shrink-0"
              >
                ▶ Play All
              </button>
            )}
          </div>
        </div>

        {/* Video grid */}
        <div className="mt-6">
          {collection.videos.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-zinc-500 text-sm">
                No videos saved here yet — tap the bookmark icon on any video and save it to this collection.
              </p>
            </div>
          ) : (
            <div className="columns-2 sm:columns-3 md:columns-4 gap-3 [column-fill:_balance]">
              {collection.videos.map((video) => (
                <div key={video.id} className="relative mb-3 break-inside-avoid rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 group">
                  <a href={`/?v=${video.id}`} className="block">
                    {video.thumbnailUrl ? (
                      <img src={video.thumbnailUrl} alt="" className="w-full h-auto object-cover" />
                    ) : (
                      <div className="w-full aspect-[9/16] bg-zinc-800" />
                    )}
                  </a>
                  {collection.canCurate && (
                    <button
                      onClick={() => handleRemoveVideo(video.id)}
                      disabled={removingId === video.id}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 hover:bg-black/90 text-white flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                      aria-label="Remove from collection"
                    >
                      ✕
                    </button>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <p className="text-white text-xs font-semibold truncate">@{video.user?.username}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCollaborators && (
        <CollaboratorsDrawer
          collection={collection}
          isOwner={collection.isOwner}
          onClose={() => setShowCollaborators(false)}
          onAdded={(user) =>
            setCollection((prev) => ({ ...prev, collaborators: [...prev.collaborators, user] }))
          }
          onRemoved={(userId) =>
            setCollection((prev) => ({ ...prev, collaborators: prev.collaborators.filter((c) => c.id !== userId) }))
          }
        />
      )}

      {showPlayAll && <PlayAllOverlay videos={collection.videos} onClose={() => setShowPlayAll(false)} />}
    </main>
  );
}
