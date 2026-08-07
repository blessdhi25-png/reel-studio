'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

function Section({ title, items, renderRow, empty }) {
  return (
    <div className="mb-8">
      <p className="font-mono text-xs text-smoke uppercase tracking-widest mb-3">{title}</p>
      {items.length === 0 ? (
        <p className="font-body text-smoke text-sm">{empty}</p>
      ) : (
        <div className="space-y-2">{items.map(renderRow)}</div>
      )}
    </div>
  );
}

export default function FraudSignalsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminGetFraudSignals().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="font-body text-smoke text-sm">Loading…</p>;
  if (!data) return null;

  return (
    <div>
      <p className="font-body text-smoke text-sm mb-8">
        Heuristic signals to help triage — not a verdict. Always review before acting.
      </p>

      <Section
        title="Most reported users (30 days)"
        items={data.mostReported}
        empty="No standout accounts."
        renderRow={(r, i) => (
          <div key={i} className="bg-ink2 rounded-sprocket p-4 flex justify-between items-center">
            <a href={`/profile/${r.user?.id}`} className="font-body text-sm text-bone">
              @{r.user?.username || 'unknown'}
            </a>
            <span className="font-mono text-xs text-red-400">{r.reportCount} reports</span>
          </div>
        )}
      />

      <Section
        title="Rapid tipping (10+ tips sent in 24h)"
        items={data.rapidTippers}
        empty="Nothing unusual."
        renderRow={(r, i) => (
          <div key={i} className="bg-ink2 rounded-sprocket p-4 flex justify-between items-center">
            <a href={`/profile/${r.user?.id}`} className="font-body text-sm text-bone">
              @{r.user?.username || 'unknown'}
            </a>
            <span className="font-mono text-xs text-yellow-400">{r.tipCount24h} tips</span>
          </div>
        )}
      />

      <Section
        title="Repeated failed payments (24h)"
        items={data.repeatedFailedPayments}
        empty="Nothing unusual."
        renderRow={(r, i) => (
          <div key={i} className="bg-ink2 rounded-sprocket p-4 flex justify-between items-center">
            <a href={`/profile/${r.user?.id}`} className="font-body text-sm text-bone">
              @{r.user?.username || 'unknown'}
            </a>
            <span className="font-mono text-xs text-yellow-400">{r.failedCount24h} failures</span>
          </div>
        )}
      />
    </div>
  );
}
