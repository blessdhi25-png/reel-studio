'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

export default function CirclesPage() {
  const router = useRouter();
  const [circles, setCircles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCircles().then(setCircles).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen px-6 py-10 max-w-2xl mx-auto pb-20">
      <a href="/menu" className="font-mono text-xs text-smoke uppercase tracking-widest">
        ← Back to menu
      </a>

      <h1 className="font-display text-4xl text-bone tracking-wide mt-8 mb-2">Topic circles</h1>
      <p className="font-body text-smoke text-sm mb-8">
        Micro-communities inside the feed — tap one to jump into the feed filtered to just that circle.
      </p>

      {loading && <p className="font-body text-smoke text-sm">Loading…</p>}

      {!loading && circles.length === 0 && (
        <p className="font-body text-smoke text-sm">
          No circles have any posts yet — once videos start landing in one, it'll show up here.
        </p>
      )}

      <div className="space-y-1">
        {circles.map((c) => (
          <button
            key={c.circle}
            onClick={() => router.push(`/?circle=${encodeURIComponent(c.circle)}`)}
            className="w-full flex items-center gap-4 py-4 border-b border-smoke/10 text-left"
          >
            <span className="flex-1 font-body text-base text-bone">{c.circle}</span>
            <span className="font-mono text-xs text-smoke">{c.count} posts</span>
            <span className="text-smoke">›</span>
          </button>
        ))}
      </div>
    </main>
  );
}
