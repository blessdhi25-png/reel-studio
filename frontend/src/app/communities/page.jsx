'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { LoadingSpinner } from '../../components/LoadingScreen';
import CreateCommunityModal, { COMMUNITY_CATEGORIES } from '../../components/CreateCommunityModal';

const TABS = [
  { value: 'joined', label: 'My Circles' },
  { value: 'all', label: 'Explore All Circles' },
];

function CommunityCard({ community, onToggleJoin, busy }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 text-white rounded-2xl overflow-hidden hover:border-zinc-700 transition-colors">
      <a href={`/communities/${community.id}`} className="block">
        <div className="relative w-full h-24">
          {community.bannerUrl ? (
            <img src={community.bannerUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900" />
          )}
          <span className="absolute -bottom-4 left-3 w-10 h-10 rounded-xl bg-amber-500 border-2 border-zinc-900 flex items-center justify-center text-sm font-black text-black">
            {community.name?.[0]?.toUpperCase()}
          </span>
        </div>
        <div className="pt-6 px-3 pb-1">
          <p className="font-body text-sm font-semibold text-white truncate">{community.name}</p>
          <p className="font-body text-xs text-zinc-500 line-clamp-2 mt-0.5 min-h-[2rem]">
            {community.description || ' '}
          </p>
        </div>
      </a>
      <div className="flex items-center justify-between px-3 pb-3 mt-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            {community.privacy === 'private' ? '🔒 Private' : '🌐 Public'}
          </span>
          <span className="font-mono text-[10px] text-zinc-600">
            {community.memberCount} {community.memberCount === 1 ? 'member' : 'members'}
          </span>
        </div>
        <button
          onClick={() => onToggleJoin(community)}
          disabled={busy}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors disabled:opacity-50 ${
            community.isJoined
              ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              : 'bg-amber-500 text-black hover:bg-amber-400'
          }`}
        >
          {community.isJoined ? 'Joined' : 'Join'}
        </button>
      </div>
    </div>
  );
}

export default function CommunitiesHubPage() {
  const router = useRouter();
  const toast = useToast();
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [busyIds, setBusyIds] = useState(new Set());

  function load() {
    setLoading(true);
    const params = {};
    if (category !== 'All') params.category = category;
    if (search.trim()) params.search = search.trim();
    api
      .getCommunities(params)
      .then(setCommunities)
      .catch(() => setCommunities([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    load();
  }

  const filtered = useMemo(
    () => (activeTab === 'joined' ? communities.filter((c) => c.isJoined) : communities),
    [communities, activeTab]
  );

  async function handleToggleJoin(community) {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    setBusyIds((prev) => new Set(prev).add(community.id));
    const willJoin = !community.isJoined;
    setCommunities((prev) =>
      prev.map((c) =>
        c.id === community.id
          ? { ...c, isJoined: willJoin, memberCount: c.memberCount + (willJoin ? 1 : -1) }
          : c
      )
    );
    try {
      await api.toggleCommunityJoin(community.id);
    } catch (err) {
      setCommunities((prev) =>
        prev.map((c) =>
          c.id === community.id
            ? { ...c, isJoined: !willJoin, memberCount: c.memberCount + (willJoin ? -1 : 1) }
            : c
        )
      );
      toast.error(err.message || 'Could not update membership');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(community.id);
        return next;
      });
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h1 className="font-display text-2xl text-white tracking-wide">Communities</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm px-4 py-2 rounded-xl transition-colors"
          >
            + Create Community
          </button>
        </div>

        <form onSubmit={handleSearchSubmit} className="mb-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search communities…"
            className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500/50"
          />
        </form>

        <div className="flex flex-wrap gap-2 mb-5">
          {['All', ...COMMUNITY_CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                category === c
                  ? 'bg-white text-black'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {c}
            </button>
          ))}
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
              {activeTab === 'joined'
                ? "You haven't joined any circles yet — explore all circles to find one."
                : 'No communities match that search yet.'}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filtered.map((c) => (
              <CommunityCard
                key={c.id}
                community={c}
                busy={busyIds.has(c.id)}
                onToggleJoin={handleToggleJoin}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateCommunityModal
          onClose={() => setShowCreate(false)}
          onCreated={(created) => router.push(`/communities/${created.id}`)}
        />
      )}
    </main>
  );
}
