'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { LoadingSpinner } from '../../../components/LoadingScreen';

const ACTION_COLOR = {
  suspend_user: 'text-amber-400',
  ban_user: 'text-red-400',
  reinstate_user: 'text-emerald-400',
  remove_video: 'text-red-400',
  resolve_report: 'text-emerald-400',
  dismiss_report: 'text-zinc-400',
  change_role: 'text-blue-400',
};

export default function AuditLogPage() {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminGetAuditLog().then(setActions).catch(() => setActions([])).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="font-display text-2xl text-white tracking-wide mb-1">System Audit Logs</h1>
      <p className="font-body text-zinc-500 text-sm mb-6">
        Every moderation action taken on the platform, most recent first — for accountability.
      </p>

      {loading && <LoadingSpinner label="Loading…" />}

      {!loading && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-900/60 border-b border-zinc-800">
                <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Timestamp</th>
                <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Moderator</th>
                <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Action</th>
                <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Target</th>
                <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Reason</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-900/40">
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500 whitespace-nowrap">
                    {new Date(a.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-body text-sm text-amber-400">@{a.admin?.username || 'unknown'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-mono text-xs uppercase tracking-widest ${ACTION_COLOR[a.actionType] || 'text-zinc-300'}`}>
                      {a.actionType.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                    {a.targetType}:{a.targetId.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-zinc-400 max-w-xs truncate">
                    {a.reason || <em className="text-zinc-600">No note</em>}
                  </td>
                </tr>
              ))}
              {actions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center font-body text-sm text-zinc-500">
                    No moderation actions recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
