'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { useToast } from '../../../context/ToastContext';
import { LoadingSpinner } from '../../../components/LoadingScreen';
import ConfirmModal from '../../../components/ConfirmModal';
import VideoCard from '../../../components/VideoCard';

const PRIVACY_OPTIONS = [
  { value: 'private', label: 'Private', icon: '🔒' },
  { value: 'shared', label: 'Collaborators Only', icon: '👥' },
  { value: 'public', label: 'Public', icon: '🌐' },
];

function Avatar({ user, size = 8 }) {
  const px = { 6: 'w-6 h-6 text-[9px]', 8: 'w-8 h-8 text-xs', 10: 'w-10 h-10 text-sm' }[size] || 'w-8 h-8 text-xs';
  return (
    <span className={`${px} rounded-full bg-zinc-700 overflow-hidden flex items-center justify-center font-bold text-zinc-300 shrink-0 border-2 border-zinc-950`}>
      {user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" /> : user?.username?.[0]?.toUpperCase() || '?'}
    </span>
  );
}

function CollaboratorDrawer({ collectionId, collaborators, isOwner, onClose, onChanged }) {
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
    const handle = setTimeout(() => {
      api
        .search(query.trim())
        .then((res) => setResults(res.users || []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const collaboratorIds = new Set(collaborators.map((c) => c.id));

  async function handleAdd(user) {
    setBusyIds((prev) => new Set(prev).add(user.id));
    try {
      const added = await api.addCollectionCollaborator(collectionId, user.id);
      onChanged((prev) => [...prev, added]);
      toast.success(`Added @${user.username} as a collaborator`);
    } catch (err) {
      toast.error(err.message || "Couldn't add that collaborator");
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(user.id);
        return next;
      });
    }
  }

  async function handleRemove(user) {
    setBusyIds((prev) => new Set(prev).add(user.id));
    try {
      await api.removeCollectionCollaborator(collectionId, user.id);
      onChanged((prev) => prev.filter((c) => c.id !== user.id));
      toast.success(`Removed @${user.username}`);
    } catch (err) {
      toast.error(err.message || "Couldn't remove that collaborator");
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(user.id);
        return next;
      });
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm max-h-[80vh] bg-zinc-900 border border-zinc-800 text-white rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <p className="font-semibold text-base">Collaborators</p>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="px-4 pt-3 pb-1 shrink-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
            Can add or remove videos
          </p>
        </div>
        <div className="px-2 pb-2 overflow-y-auto max-h-40 shrink-0">
          {collaborators.length === 0 && (
            <p className="text-xs text-zinc-500 px-3 py-2">No collaborators yet.</p>
          )}
          {collaborators.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2">
              <Avatar user={c} />
              <span className="flex-1 text-sm text-white truncate">@{c.username}</span>
              {isOwner && (
                <button
                  onClick={() => handleRemove(c)}
                  disabled={busyIds.has(c.id)}
                  className="text-xs text-rose-400 hover:text-rose-300 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

        {isOwner && (
          <div className="border-t border-zinc-800 px-4 pt-3 pb-4 shrink-0">
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Invite someone</p>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by username…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 outline-none focus:ring-2 focus:ring-amber-500/50"
            />
            <div className="mt-2 max-h-40 overflow-y-auto">
              {searching && <p className="text-xs text-zinc-500 px-1 py-2">Searching…</p>}
              {!searching &&
                results
                  .filter((u) => !collaboratorIds.has(u.id))
                  .map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleAdd(u)}
                      disabled={busyIds.has(u.id)}
                      className="w-full flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-zinc-800/60 disabled:opacity-50"
                    >
                      <Avatar user={u} />
                      <span className="flex-1 text-left text-sm text-white truncate">@{u.username}</span>
                      <span className="text-xs text-amber-400 font-semibold">+ Add</span>
                    </button>
                  ))}
            </div>
          </div>
        )}
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
  const [playAll, setPlayAll] = useState(false);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [showPrivacyMenu, setShowPrivacyMenu] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function load() {
    return api
      .getCollection(id)
      .then(setCollection)
      .catch(() => setNotFound(true));
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handlePrivacyChange(privacy) {
    setPrivacyBusy(true);
    setShowPrivacyMenu(false);
    try {
      await api.updateCollection(id, { privacy });
      setCollection((prev) => ({ ...prev, privacy }));
      toast.success('Privacy updated');
    } catch (err) {
      toast.error(err.message || "Couldn't update privacy");
    } finally {
      setPrivacyBusy(false);
    }
  }

  async function handleRemoveVideo(videoId) {
    setRemovingId(videoId);
    try {
      await api.saveToCollection(id, videoId);
      setCollection((prev) => ({
        ...prev,
        videos: prev.videos.filter((v) => v.id !== videoId),
        videoCount: prev.videoCount - 1,
      }));
    } catch (err) {
      toast.error(err.message || "Couldn't remove that video");
    } finally {
      setRemovingId(null);
    }
  }

  async function handleDeleteCollection() {
    try {
      await api.deleteCollection(id);
      toast.success('Collection deleted');
      router.push('/collections');
    } catch (err) {
      toast.error(err.message || "Couldn't delete this collection");
      setConfirmDelete(false);
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
      <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-3">
        <p className="text-zinc-400 text-sm">This collection doesn't exist, or isn't visible to you.</p>
        <a href="/collections" className="text-amber-400 text-sm font-semibold">
          ← Back to Collections
        </a>
      </main>
    );
  }

  const isOwner = collection.myRole === 'owner';
  const canEdit = isOwner || collection.myRole === 'collaborator';

  if (playAll) {
    return (
      <main className="min-h-screen bg-black">
        <div className="fixed top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
          <button onClick={() => setPlayAll(false)} className="text-white text-sm font-semibold flex items-center gap-1.5">
            ← {collection.name}
          </button>
        </div>
        {collection.videos.length === 0 ? (
          <div className="min-h-screen flex items-center justify-center">
            <p className="text-zinc-500 text-sm">No videos to play.</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-900">
            {collection.videos.map((video) => (
              <div key={video.id} className="relative h-[100dvh] bg-black">
                <VideoCard video={video} />
              </div>
            ))}
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <a href="/collections" className="text-zinc-500 hover:text-zinc-300 text-xs font-semibold mb-4 inline-block">
          ← All Collections
        </a>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-2xl text-white tracking-wide truncate">{collection.name}</h1>
              {collection.description && (
                <p className="font-body text-sm text-zinc-400 mt-1">{collection.description}</p>
              )}
            </div>

            {isOwner && (
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowPrivacyMenu((v) => !v)}
                  disabled={privacyBusy}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                >
                  {PRIVACY_OPTIONS.find((p) => p.value === collection.privacy)?.icon}{' '}
                  {PRIVACY_OPTIONS.find((p) => p.value === collection.privacy)?.label}
                </button>
                {showPrivacyMenu && (
                  <div className="absolute right-0 top-9 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden z-10 w-48">
                    {PRIVACY_OPTIONS.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => handlePrivacyChange(p.value)}
                        className="w-full text-left px-3.5 py-2.5 text-xs text-zinc-200 hover:bg-zinc-700 flex items-center gap-2"
                      >
                        {p.icon} {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-3">
              <a href={`/profile/${collection.owner.id}`} className="flex items-center gap-2">
                <Avatar user={collection.owner} size={8} />
                <span className="text-xs text-zinc-400">@{collection.owner.username}</span>
              </a>

              {collection.collaborators.length > 0 && (
                <button onClick={() => setShowCollaborators(true)} className="flex -space-x-2">
                  {collection.collaborators.slice(0, 4).map((c) => (
                    <Avatar key={c.id} user={c} size={6} />
                  ))}
                </button>
              )}

              <button
                onClick={() => setShowCollaborators(true)}
                className="text-xs text-amber-400 font-semibold hover:text-amber-300"
              >
                {canEdit ? 'Manage collaborators' : `${collection.collaborators.length} collaborators`}
              </button>
            </div>
            <span className="font-mono text-[10px] text-zinc-500">
              {collection.videoCount} save{collection.videoCount === 1 ? '' : 's'}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={() => setPlayAll(true)}
              disabled={collection.videoCount === 0}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold disabled:opacity-40 transition-colors"
            >
              ▶ Play All
            </button>
            {isOwner && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 hover:text-rose-400 hover:border-rose-500/40 text-sm font-semibold transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        <div className="mt-6">
          {collection.videos.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-zinc-500 text-sm">No videos saved here yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {collection.videos.map((v) => (
                <div key={v.id} className="relative aspect-[9/16] bg-zinc-900 rounded-xl overflow-hidden group">
                  <a href={`/?video=${v.id}`}>
                    {v.thumbnailUrl ? (
                      <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-700 text-2xl">🎬</div>
                    )}
                  </a>
                  <span className="absolute bottom-1.5 left-1.5 font-mono text-[9px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                    @{v.user?.username}
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => handleRemoveVideo(v.id)}
                      disabled={removingId === v.id}
                      aria-label="Remove from collection"
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                    >
                      {removingId === v.id ? '…' : '✕'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCollaborators && (
        <CollaboratorDrawer
          collectionId={id}
          collaborators={collection.collaborators}
          isOwner={isOwner}
          onClose={() => setShowCollaborators(false)}
          onChanged={(updater) => setCollection((prev) => ({ ...prev, collaborators: updater(prev.collaborators) }))}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete this collection?"
          message="The videos in it won't be deleted — just unlinked from this collection."
          confirmLabel="Delete"
          onConfirm={handleDeleteCollection}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </main>
  );
}
