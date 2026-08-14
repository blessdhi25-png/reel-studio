'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { useToast } from '../../../context/ToastContext';
import { LoadingSpinner } from '../../../components/LoadingScreen';
import VideoCard from '../../../components/VideoCard';

const PRIVACY_OPTIONS = [
  { id: 'private', label: 'Private', icon: '🔒' },
  { id: 'public', label: 'Public', icon: '🌐' },
  { id: 'collaborators', label: 'Collaborators', icon: '👥' },
];

const PRIVACY_LABEL = {
  private: '🔒 Private',
  public: '🌐 Public',
  collaborators: '👥 Shared',
};

function AvatarStack({ users, max = 5 }) {
  const shown = users.slice(0, max);
  const overflow = users.length - shown.length;
  if (users.length === 0) return null;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((u) => (
        <span
          key={u.id}
          title={`@${u.username}`}
          className="w-7 h-7 rounded-full border-2 border-zinc-900 bg-zinc-700 overflow-hidden flex items-center justify-center text-[10px] font-bold text-zinc-300"
        >
          {u.avatarUrl ? (
            <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            u.username?.[0]?.toUpperCase()
          )}
        </span>
      ))}
      {overflow > 0 && (
        <span className="w-7 h-7 rounded-full border-2 border-zinc-900 bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400">
          +{overflow}
        </span>
      )}
    </div>
  );
}

function CollaboratorsDrawer({ collection, isOwner, onClose, onCollaboratorsChange }) {
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  async function handleInvite(e) {
    e.preventDefault();
    if (!username.trim() || inviting) return;
    setInviting(true);
    setInviteError(null);
    try {
      const collaborators = await api.addCollaborator(collection.id, { username: username.trim() });
      onCollaboratorsChange(collaborators);
      toast.success(`Added @${username.trim()}`);
      setUsername('');
    } catch (err) {
      setInviteError(err.message || 'Could not add that person.');
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(userId) {
    setRemovingId(userId);
    try {
      await api.removeCollaborator(collection.id, userId);
      onCollaboratorsChange(collection.collaborators.filter((c) => c.id !== userId));
      toast.success('Removed');
    } catch (err) {
      toast.error(err.message || 'Could not remove that person.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full sm:w-[420px] max-h-[80vh] bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 sm:rounded-2xl rounded-t-2xl text-white flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-3 border-b border-zinc-800">
          <h2 className="text-base font-bold">Collaborators</h2>
          <button onClick={onClose} className="p-2 -m-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800">
            ✕
          </button>
        </div>

        {isOwner && (
          <form onSubmit={handleInvite} className="shrink-0 px-5 py-4 border-b border-zinc-800 flex gap-2">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username to invite"
              className="flex-1 bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 placeholder:text-zinc-500"
            />
            <button
              type="submit"
              disabled={!username.trim() || inviting}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold disabled:opacity-40 shrink-0"
            >
              {inviting ? '…' : 'Add'}
            </button>
          </form>
        )}
        {inviteError && <p className="px-5 pt-2 text-xs text-red-400">{inviteError}</p>}

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
          {collection.collaborators.length === 0 && (
            <p className="text-sm text-zinc-500 py-4 text-center">No collaborators yet.</p>
          )}
          {collection.collaborators.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-2.5">
              <span className="w-9 h-9 rounded-full bg-zinc-700 overflow-hidden flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
                {c.avatarUrl ? <img src={c.avatarUrl} alt="" className="w-full h-full object-cover" /> : c.username?.[0]?.toUpperCase()}
              </span>
              <a href={`/profile/${c.id}`} className="flex-1 text-sm text-white hover:underline truncate">
                @{c.username}
              </a>
              {isOwner && (
                <button
                  onClick={() => handleRemove(c.id)}
                  disabled={removingId === c.id}
                  className="text-xs text-red-400 hover:text-red-300 font-semibold disabled:opacity-50"
                >
                  {removingId === c.id ? '…' : 'Remove'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditCollectionForm({ collection, onClose, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description || '');
  const [privacy, setPrivacy] = useState(collection.privacy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateCollection(collection.id, {
        name: name.trim(),
        description: description.trim(),
        privacy,
      });
      onSaved(updated);
      toast.success('Collection updated');
      onClose();
    } catch (err) {
      setError(err.message || 'Could not save changes.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${collection.name}"? This can't be undone.`)) return;
    try {
      await api.deleteCollection(collection.id);
      toast.success('Collection deleted');
      router.push('/collections');
    } catch (err) {
      toast.error(err.message || 'Could not delete this collection.');
    }
  }

  return (
    <form onSubmit={handleSave} className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Description"
        className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 resize-none placeholder:text-zinc-500"
      />
      <div className="flex gap-1.5">
        {PRIVACY_OPTIONS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPrivacy(p.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl border text-[11px] font-semibold transition-all ${
              privacy === p.id ? 'bg-amber-500 border-amber-500 text-black' : 'bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:text-white'
            }`}
          >
            <span>{p.icon}</span>
            {p.label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-semibold hover:bg-zinc-800">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim() || busy}
          className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
      <button type="button" onClick={handleDelete} className="w-full text-center text-xs text-red-400 hover:text-red-300 font-semibold pt-1">
        Delete Collection
      </button>
    </form>
  );
}

// Full-screen vertical reel player for "Play All" — a self-contained
// snap-scroll stack of VideoCards, separate from the main feed page's
// version of the same pattern since that one is wired to global feed
// state (pagination cursor, filters) this doesn't need.
function CollectionPlayer({ videos, startIndex, onClose }) {
  const containerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(startIndex);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Plain assignment rather than el.scrollTo({ behavior: 'instant' }) —
    // 'instant' isn't part of the actual ScrollBehavior spec (only 'auto'
    // and 'smooth' are), so this avoids relying on a non-standard value
    // some browsers happen to accept.
    el.scrollTop = startIndex * el.clientHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    setActiveIndex(Math.round(el.scrollTop / el.clientHeight));
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black">
      <button
        onClick={onClose}
        aria-label="Close player"
        className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center text-lg"
      >
        ✕
      </button>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-dvh w-full overflow-y-scroll snap-y snap-mandatory"
      >
        {videos.map((v, i) => (
          <div key={v.id} className="h-dvh w-full snap-start">
            <VideoCard
              video={v}
              isActive={i === activeIndex}
              shouldLoad={Math.abs(i - activeIndex) <= 2}
            />
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
  const [showEdit, setShowEdit] = useState(false);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [removingIds, setRemovingIds] = useState(() => new Set());
  const [player, setPlayer] = useState(null); // { startIndex } | null

  useEffect(() => {
    api
      .getCollection(id)
      .then(setCollection)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleRemoveVideo(videoId) {
    setRemovingIds((prev) => new Set(prev).add(videoId));
    try {
      await api.saveToCollection(id, videoId);
      setCollection((prev) => ({
        ...prev,
        videos: prev.videos.filter((v) => v.id !== videoId),
        videoCount: prev.videoCount - 1,
      }));
      toast.success('Removed from collection');
    } catch (err) {
      toast.error(err.message || 'Could not remove that video.');
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(videoId);
        return next;
      });
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

  const allPeople = [collection.owner, ...collection.collaborators].filter(Boolean);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 pb-20">
      <div className="max-w-4xl mx-auto">
        <a href="/collections" className="font-mono text-xs text-zinc-500 uppercase tracking-widest hover:text-zinc-300">
          ← Collections
        </a>

        <div className="bg-zinc-900 border border-zinc-800 text-white rounded-2xl p-5 mt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-2xl text-white tracking-wide truncate">{collection.name}</h1>
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 shrink-0">
                  {PRIVACY_LABEL[collection.privacy]}
                </span>
              </div>
              {collection.description && (
                <p className="font-body text-sm text-zinc-400 mt-2">{collection.description}</p>
              )}
              <p className="font-body text-xs text-zinc-500 mt-3">
                {collection.videoCount} save{collection.videoCount === 1 ? '' : 's'} · Created by{' '}
                <a href={`/profile/${collection.owner.id}`} className="text-zinc-200 hover:underline">
                  @{collection.owner.username}
                </a>
              </p>
            </div>
            {collection.videoCount > 0 && (
              <button
                onClick={() => setPlayer({ startIndex: 0 })}
                className="shrink-0 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5"
              >
                ▶ Play All
              </button>
            )}
          </div>

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800">
            <button onClick={() => setShowCollaborators(true)} className="flex items-center gap-2">
              <AvatarStack users={allPeople} />
              <span className="text-xs text-zinc-500 font-semibold">
                {allPeople.length} {allPeople.length === 1 ? 'person' : 'people'}
              </span>
            </button>
            {collection.isOwner && (
              <button
                onClick={() => setShowEdit((v) => !v)}
                className="text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-full transition-colors"
              >
                {showEdit ? 'Close' : 'Manage Collection'}
              </button>
            )}
          </div>

          {showEdit && collection.isOwner && (
            <EditCollectionForm collection={collection} onClose={() => setShowEdit(false)} onSaved={(updated) => setCollection((prev) => ({ ...prev, ...updated }))} />
          )}
        </div>

        {collection.videos.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-zinc-500 text-sm">Nothing saved here yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1 mt-4">
            {collection.videos.map((v, i) => (
              <div key={v.id} className="relative aspect-[9/16] bg-zinc-900 group">
                <button onClick={() => setPlayer({ startIndex: i })} className="block w-full h-full">
                  {v.thumbnailUrl ? (
                    <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900" />
                  )}
                </button>
                {collection.canEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveVideo(v.id);
                    }}
                    disabled={removingIds.has(v.id)}
                    aria-label="Remove from collection"
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                  >
                    {removingIds.has(v.id) ? '…' : '✕'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showCollaborators && (
        <CollaboratorsDrawer
          collection={collection}
          isOwner={collection.isOwner}
          onClose={() => setShowCollaborators(false)}
          onCollaboratorsChange={(collaborators) => setCollection((prev) => ({ ...prev, collaborators }))}
        />
      )}

      {player && (
        <CollectionPlayer
          videos={collection.videos}
          startIndex={player.startIndex}
          onClose={() => setPlayer(null)}
        />
      )}
    </main>
  );
}
