'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState({ users: [], videos: [] });
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    api.getTrending().then(setTrending).catch(() => {});
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults({ users: [], videos: [] });
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      api
        .search(q)
        .then(setResults)
        .catch(() => setResults({ users: [], videos: [] }))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [q]);

  const hasQuery = q.trim().length > 0;

  return (
    <main className="min-h-screen px-6 py-10 max-w-2xl mx-auto pb-24">
      <a href="/" className="font-mono text-xs text-smoke uppercase tracking-widest">
        ← Back
      </a>

      <div className="mt-6 flex items-center gap-3 bg-ink2 rounded-sprocket px-4 py-3 border border-smoke/15">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="text-smoke shrink-0">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search creators and videos"
          className="flex-1 bg-transparent outline-none font-body text-sm text-bone placeholder:text-smoke"
        />
        {q && (
          <button onClick={() => setQ('')} className="text-smoke text-sm">✕</button>
        )}
      </div>

      {!hasQuery && (
        <>
          <p className="font-mono text-xs uppercase tracking-widest text-smoke mt-10 mb-3">
            Trending now
          </p>
          <div className="grid grid-cols-3 gap-1">
            {trending.map((v) => (
              <a
                key={v.id}
                href={`/profile/${v.user?.id}`}
                className="relative aspect-[9/16] bg-ink2 rounded-sprocket overflow-hidden"
              >
                {v.thumbnailUrl && (
                  <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                )}
                <span className="absolute bottom-1 left-1 font-mono text-[10px] text-bone bg-ink/60 px-1 rounded-sprocket">
                  ♥ {Number(v.likeCount)}
                </span>
              </a>
            ))}
            {trending.length === 0 && (
              <p className="col-span-3 font-body text-sm text-smoke">Nothing trending yet.</p>
            )}
          </div>
        </>
      )}

      {hasQuery && (
        <div className="mt-8">
          {loading && <p className="font-body text-sm text-smoke">Searching…</p>}

          {!loading && results.users.length === 0 && results.videos.length === 0 && (
            <p className="font-body text-sm text-smoke">No results for "{q}".</p>
          )}

          {results.users.length > 0 && (
            <>
              <p className="font-mono text-xs uppercase tracking-widest text-smoke mb-3">
                Creators
              </p>
              <div className="space-y-1 mb-8">
                {results.users.map((u) => (
                  <a
                    key={u.id}
                    href={`/profile/${u.id}`}
                    className="flex items-center gap-3 py-2 border-b border-smoke/10"
                  >
                    <span className="w-10 h-10 rounded-full overflow-hidden bg-ink2 shrink-0">
                      {u.avatarUrl && (
                        <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="font-body text-sm text-bone truncate">@{u.username}</p>
                      {u.displayName && (
                        <p className="font-body text-xs text-smoke truncate">{u.displayName}</p>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </>
          )}

          {results.videos.length > 0 && (
            <>
              <p className="font-mono text-xs uppercase tracking-widest text-smoke mb-3">
                Videos
              </p>
              <div className="space-y-1">
                {results.videos.map((v) => (
                  <a
                    key={v.id}
                    href={`/profile/${v.userId}`}
                    className="flex items-center gap-3 py-2 border-b border-smoke/10"
                  >
                    <span className="w-10 h-14 rounded-sprocket overflow-hidden bg-ink2 shrink-0">
                      {v.thumbnailUrl && (
                        <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="font-body text-sm text-bone truncate">{v.caption || 'Untitled'}</p>
                      <p className="font-mono text-[10px] text-smoke">@{v.user?.username}</p>
                    </div>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
