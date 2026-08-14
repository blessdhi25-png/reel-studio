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

function CollectionCard({ collection }) {
  const thumbs = collection.previewThumbnails.slice(0, 4);
  return (
    <a
      href={`/collections/${collection.id}`}
      className="block bg-zinc-900 border border-zinc-800 text-white rounded-2xl overflow-hidden hover:border-zinc-700 transition-colors"
    >
      <div className="grid grid-cols-2 grid-rows-2 aspect-square bg-zinc-800">
        {thumbs.length > 0 ? (
          <>
            {thumbs.map((src, i) => (
              <img key={i} src={src} alt="" className="w-full h-full object-cover" />
            ))}
            {Array.from({ length: 4 - thumbs.length }).map((_, i) => (
              <div key={`empty-${i}`} className="w-full h-full bg-zinc-800/60" />
            ))}
          </>
        ) : (
          <div className="col-span-2 row-span-2 flex items-center justify-center text-zinc-600 text-3xl">
            📁
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="font-body text-sm font-semibold text-white truncate">{collection.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="font-mono text-[10px] text-zinc-500">
            {collection.itemCount} {collection.itemCount === 1 ? 'video' : 'videos'}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            {PRIVACY_BADGE[collection.privacy]}
          </span>
        </div>
        <p className="font-body text-[11px] text-zinc-600 mt-1 truncate">
          by {collection.isOwner ? 'you' : `@${collection.owner?.username}`}
        </p>
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
      const created = await api.createCollection({
        name: name.trim(),
        description: description.trim() || undefined,
        privacy,
      });
      toast.success(`"${created.name}" created`);
      onCreated?.(created);
    } catch (err) {
      toast.error(err.message || 'Could not create collection');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        className="w-full sm:max-w-md sm:mx-4 max-h-[85vh] bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 text-white rounded-t-3xl sm:rounded-2xl flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
          <p className="font-display text-lg tracking-wide">Create Collection</p>
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
              placeholder="e.g. Inspiration"
              maxLength={60}
              className="w-full bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 block">
              Description <span className="normal-case text-zinc-600">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this collection about?"
              maxLength={280}
              rows={3}
              className="w-full bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500/50 resize-none"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 block">
              Privacy
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PRIVACY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPrivacy(opt.value)}
                  className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-colors ${
                    privacy === opt.value
                      ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                      : 'bg-zinc-800/60 border-zinc-700 text-zinc-400'
                  }`}
                >
                  <span className="text-base leading-none">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={!name.trim() || busy}
            className="w-full py-3 rounded-xl bg-amber-500 text-black text-sm font-bold hover:bg-amber-400 disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create Collection'}
          </button>
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

  function load(tab) {
    setLoading(true);
    api
      .getCollections({ tab })
      .then(setCollections)
      .catch(() => setCollections([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if ((activeTab === 'mine' || activeTab === 'shared') && !localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    load(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h1 className="font-display text-2xl text-white tracking-wide">Collections</h1>
          <button
            onClick={() => {
              if (!localStorage.getItem('token')) {
                router.push('/login');
                return;
              }
              setShowCreate(true);
            }}
            className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm px-4 py-2 rounded-xl transition-colors"
          >
            + Create Collection
          </button>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
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

        {!loading && collections.length === 0 && (
          <div className="text-center py-16">
            <p className="text-zinc-500 text-sm">
              {activeTab === 'mine' && "You haven't created any collections yet."}
              {activeTab === 'shared' && "No one has added you as a collaborator yet."}
              {activeTab === 'public' && 'No public collections yet — be the first to share one.'}
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
