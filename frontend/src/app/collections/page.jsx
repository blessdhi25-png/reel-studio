'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { LoadingSpinner } from '../../components/LoadingScreen';

const TABS = [
  { value: 'mine', label: 'My Collections' },
  { value: 'shared', label: 'Shared with Me' },
  { value: 'public', label: 'Public Collections' },
];

const PRIVACY_BADGE = {
  private: '🔒 Private',
  public: '🌐 Public',
  collaborators: '👥 Shared',
};

const PRIVACY_OPTIONS = [
  { id: 'private', label: 'Private', icon: '🔒' },
  { id: 'public', label: 'Public', icon: '🌐' },
  { id: 'collaborators', label: 'Collaborators', icon: '👥' },
];

function CollectionCard({ collection }) {
  const thumbs = collection.coverThumbnails || [];
  return (
    <a
      href={`/collections/${collection.id}`}
      className="block bg-zinc-900 border border-zinc-800 text-white rounded-2xl overflow-hidden hover:border-zinc-700 transition-colors"
    >
      <div className="grid grid-cols-2 grid-rows-2 aspect-square bg-zinc-950">
        {thumbs.length > 0 ? (
          Array.from({ length: 4 }).map((_, i) =>
            thumbs[i] ? (
              <img key={i} src={thumbs[i]} alt="" className="w-full h-full object-cover" />
            ) : (
              <div key={i} className="w-full h-full bg-zinc-900" />
            )
          )
        ) : (
          <div className="col-span-2 row-span-2 flex items-center justify-center text-3xl text-zinc-700">
            📁
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="font-body text-sm font-semibold text-white truncate">{collection.name}</p>
        <div className="flex items-center justify-between mt-1">
          <span className="font-mono text-[10px] text-zinc-500">
            {collection.videoCount} video{collection.videoCount === 1 ? '' : 's'}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            {PRIVACY_BADGE[collection.privacy] || PRIVACY_BADGE.private}
          </span>
        </div>
      </div>
    </a>
  );
}

function CreateCollectionModal({ onClose, onCreated }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState('private');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createCollection({
        name: name.trim(),
        description: description.trim() || undefined,
        privacy,
      });
      toast.success(`Created ${created.name}`);
      onCreated(created);
    } catch (err) {
      setError(err.message || 'Could not create that collection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative w-full sm:w-[420px] bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 sm:rounded-2xl rounded-t-2xl text-white p-5">
        <h2 className="text-base font-bold mb-4">New Collection</h2>
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Inspiration"
              maxLength={60}
              className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all placeholder:text-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Description <span className="normal-case text-zinc-600">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What's this collection about?"
              className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all resize-none placeholder:text-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Privacy
            </label>
            <div className="flex gap-1.5">
              {PRIVACY_OPTIONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPrivacy(p.id)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl border text-[11px] font-semibold transition-all ${
                    privacy === p.id
                      ? 'bg-amber-500 border-amber-500 text-black'
                      : 'bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>{p.icon}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-semibold hover:bg-zinc-800 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || busy}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-all disabled:opacity-40"
            >
              {busy ? 'Creating…' : 'Create Collection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CollectionsHubPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('mine');
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    setLoading(true);
    api
      .getCollections(activeTab)
      .then(setCollections)
      .catch(() => setCollections([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="font-display text-2xl text-white tracking-wide">Collections</h1>
            <p className="font-body text-sm text-zinc-500 mt-0.5">
              Organize saved videos into folders you can keep private or share.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="shrink-0 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm px-4 py-2 rounded-xl transition-colors"
          >
            + Create Collection
          </button>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                activeTab === tab.value
                  ? 'bg-amber-500 text-black'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading && <LoadingSpinner label="Loading…" />}

        {!loading && collections.length === 0 && (
          <div className="text-center py-16">
            <p className="text-zinc-500 text-sm">
              {activeTab === 'mine' && "You haven't created any collections yet."}
              {activeTab === 'shared' && "No one's shared a collection with you yet."}
              {activeTab === 'public' && 'No public collections yet.'}
            </p>
          </div>
        )}

        {!loading && collections.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {collections.map((c) => (
              <CollectionCard key={c.id} collection={c} />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateCollectionModal
          onClose={() => setShowCreate(false)}
          onCreated={(created) => router.push(`/collections/${created.id}`)}
        />
      )}
    </main>
  );
}
