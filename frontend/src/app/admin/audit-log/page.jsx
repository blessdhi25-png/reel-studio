'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

const ACTION_COLORS = {
  ban_user: 'text-red-400',
  reinstate_user: 'text-emerald-400',
  delete_video: 'text-red-400',
  resolve_report: 'text-emerald-400',
  dismiss_report: 'text-zinc-400',
  change_role: 'text-blue-400',
};

export default function AuditLogPage() {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    api
      .adminGetAuditLog(1)
      .then((res) => {
        const logs = Array.isArray(res) ? res : res?.data || res?.logs || [];
        setActions(logs);
        setHasMore(res?.hasMore || false);
      })
      .catch(() => setActions([]))
      .finally(() => setLoading(false));
  }, []);

  async function loadMore() {
    const nextPage = page + 1;
    try {
      const res = await api.adminGetAuditLog(nextPage);
      const logs = Array.isArray(res) ? res : res?.data || res?.logs || [];
      setActions((prev) => [...prev, ...logs]);
      setPage(nextPage);
      setHasMore(res?.hasMore || false);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Audit Log</h1>

      {loading ? (
        <p className="text-zinc-400">Loading audit logs...</p>
      ) : actions.length === 0 ? (
        <p className="text-zinc-400">No recorded audit events found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
              <tr>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Admin</th>
                <th className="py-3 px-4">Target ID</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((log) => (
                <tr key={log.id || log._id} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
                  <td className={`py-3 px-4 font-mono font-semibold ${ACTION_COLORS[log.action] || 'text-zinc-300'}`}>
                    {log.action}
                  </td>
                  <td className="py-3 px-4">{log.admin?.email || log.adminId || 'System'}</td>
                  <td className="py-3 px-4 font-mono text-zinc-400">{log.targetId || 'N/A'}</td>
                  <td className="py-3 px-4 text-zinc-400">{log.reason || '-'}</td>
                  <td className="py-3 px-4 text-zinc-500">{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={loadMore}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-md text-sm font-medium transition"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}