'use client';

import { useEffect, useMemo, useState } from 'react';
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
  shared: '👥 Shared',
};

function CollectionCard({ collection }) {
  const thumbs = collection.previewThumbnails || [];
  return (
    <a
      href={`/collections/${collection.id}`}
      className="bg-zinc-900 border border-zinc-800 text-white rounded-2xl overflow-hidden hover:border-zinc-700 transition-colors block"
    >
      <div className="grid grid-cols-2 grid-rows-2 gap-px bg-zinc-800 aspect-square">
        {[0, 1, 2, 3].map((i) =>
          thumbs[i] ? (
            <img key={i} src={thumbs[i]} alt="" className="w-full h-full object-cover" />
          ) : (
            <div key={i} className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-700 text-lg">
              🎬
            </div>
          )
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
        {collection.role === 'collaborator' && (
          <p className="font-mono text-[9px] text-amber-400 mt-1">
            by @{collection.owner?.username} · you're a collaborator
          </p>
        )}
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

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const created = await api.createCollection({ name: name.trim(), description: description.trim(), privacy });
      onCreated(created);
    } catch (err) {
      toast.error(err.message || "Couldn't create that collection");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-sm bg-zinc-900 border border-zinc-800 text-white rounded-t-2xl sm:rounded-2xl p-5 space-y-3"
      >
        <p className="font-semibold text-base mb-1">New collection</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Collection name"
          maxLength={80}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 outline-none focus:ring-2 focus:ring-amber-500/50"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          maxLength={300}
          rows={2}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 outline-none resize-none focus:ring-2 focus:ring-amber-500/50"
        />
        <div className="flex gap-1.5">
          {[
            { value: 'private', label: 'Private', icon: '🔒' },
            { value: 'shared', label: 'Collaborators', icon: '👥' },
            { value: 'public', label: 'Public', icon: '🌐' },
          ].map((p) => (
            <button
              type="button"
              key={p.value}
              onClick={() => setPrivacy(p.value)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold border ${
                privacy === p.value ? 'bg-amber-500 text-black border-amber-500' : 'border-zinc-700 text-zinc-300'
              }`}
            >
              {p.icon} {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-zinc-300 border border-zinc-700">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || busy}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 text-black disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function CollectionsHubPage() {
  const router = useRouter();
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('mine');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    api
      .getCollections()
      .then(setCollections)
      .catch(() => setCollections([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (activeTab === 'mine') return collections.filter((c) => c.role === 'owner');
    if (activeTab === 'shared') return collections.filter((c) => c.role === 'collaborator');
    // Public tab is for discovering *other* people's public collections —
    // your own public ones already show up under "My Collections".
    return collections.filter((c) => c.privacy === 'public' && c.role !== 'owner');
  }, [collections, activeTab]);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h1 className="font-display text-2xl text-white tracking-wide">Collections</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm px-4 py-2 rounded-xl transition-colors"
          >
            + Create Collection
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
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

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-zinc-500 text-sm">
              {activeTab === 'mine' && "You haven't created any collections yet."}
              {activeTab === 'shared' && "No one's added you as a collaborator yet."}
              {activeTab === 'public' && 'No public collections to browse yet.'}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {filtered.map((c) => (
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
