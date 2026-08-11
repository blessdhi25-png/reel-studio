'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { LoadingSpinner } from '../../../components/LoadingScreen';

function riskColor(score) {
  if (score >= 70) return 'text-red-400 border-red-500/30 bg-red-500/10';
  if (score >= 40) return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
  return 'text-zinc-400 border-zinc-700 bg-zinc-800/50';
}

function SummaryCard({ label, value, tracked, hint }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">{label}</p>
      {tracked ? (
        <p className="font-display text-3xl text-white">{value}</p>
      ) : (
        <>
          <p className="font-display text-3xl text-zinc-700">—</p>
          <p className="font-body text-[11px] text-zinc-600 mt-1">{hint}</p>
        </>
      )}
    </div>
  );
}

export default function FraudSignalsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminGetFraudSignals().then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="font-display text-2xl text-white tracking-wide mb-1">Fraud &amp; Risk Signals</h1>
      <p className="font-body text-zinc-500 text-sm mb-6">
        Heuristic signals to help triage — not a verdict. Always review before acting.
      </p>

      {loading && <LoadingSpinner label="Loading…" />}

      {!loading && !data && (
        <p className="font-body text-sm text-zinc-500">Couldn't load fraud signals right now.</p>
      )}

      {!loading && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <SummaryCard
              label="High Risk IPs"
              value={data.summary.highRiskIps.count}
              tracked={data.summary.highRiskIps.tracked}
              hint="Not tracked — this app doesn't log IP addresses yet."
            />
            <SummaryCard
              label="Bot-Like Clusters"
              value={data.summary.botLikeClusters.count}
              tracked={data.summary.botLikeClusters.tracked}
            />
            <SummaryCard
              label="Multi-Account Signups"
              value={data.summary.multiAccountSignups.count}
              tracked={data.summary.multiAccountSignups.tracked}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-900/60 border-b border-zinc-800">
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Account</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Risk Score</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Trigger</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500 text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={`${r.userId}-${i}`} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-900/40">
                    <td className="px-4 py-3">
                      <a href={`/profile/${r.userId}`} className="font-body text-sm text-white hover:text-amber-400">
                        @{r.username || 'unknown'}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block font-mono text-xs font-bold px-2 py-1 rounded-md border ${riskColor(r.riskScore)}`}>
                        {r.riskScore}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-body text-sm text-zinc-400">{r.trigger}</td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/profile/${r.userId}`}
                        className="inline-block font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
                      >
                        Review Account
                      </a>
                    </td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center font-body text-sm text-zinc-500">
                      No flagged accounts right now.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
