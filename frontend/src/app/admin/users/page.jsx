'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { LoadingSpinner } from '../../../components/LoadingScreen';

const STATUS_COLOR = {
  active: 'text-reel',
  suspended: 'text-yellow-400',
  banned: 'text-red-400',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    load();
  }, []);

  function load(params) {
    setLoading(true);
    api.adminGetUsers(params).then(setUsers).finally(() => setLoading(false));
  }

  async function act(fn, id, ...args) {
    setBusyId(id);
    try {
      await fn(id, ...args);
      load(search ? { search } : {});
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(search ? { search } : {});
        }}
        className="mb-6"
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search username or email…"
          className="w-full bg-ink2 text-bone font-body text-sm rounded-sprocket p-3 outline-none border border-transparent focus:border-reel/50"
        />
      </form>

      {loading && <LoadingSpinner label="Loading…" />}

      <div className="space-y-3">
        {users.map((u) => (
          <div key={u.id} className="bg-ink2 rounded-sprocket p-4">
            <div className="flex items-center justify-between mb-1">
              <a href={`/profile/${u.id}`} className="font-body text-sm text-bone">
                @{u.username}
              </a>
              <span className={`font-mono text-[10px] uppercase tracking-widest ${STATUS_COLOR[u.accountStatus]}`}>
                {u.accountStatus}
              </span>
            </div>
            <p className="font-body text-xs text-smoke mb-1">{u.email}</p>
            <p className="font-mono text-[10px] text-smoke mb-3">
              role: {u.role} · videos: {u._count?.videos} · reports against: {u.reportsAgainstCount}
              {u.statusReason && <> · reason: {u.statusReason}</>}
            </p>

            <div className="flex flex-wrap gap-2">
              {u.accountStatus !== 'suspended' && (
                <button
                  disabled={busyId === u.id}
                  onClick={() => act((id) => api.adminSuspendUser(id, window.prompt('Reason?') || undefined), u.id)}
                  className="font-mono text-[10px] uppercase tracking-widest px-3 py-2 rounded-sprocket border border-yellow-400/40 text-yellow-400 disabled:opacity-40"
                >
                  Suspend
                </button>
              )}
              {u.accountStatus !== 'banned' && (
                <button
                  disabled={busyId === u.id}
                  onClick={() => act((id) => api.adminBanUser(id, window.prompt('Reason?') || undefined), u.id)}
                  className="font-mono text-[10px] uppercase tracking-widest px-3 py-2 rounded-sprocket border border-red-400/40 text-red-400 disabled:opacity-40"
                >
                  Ban
                </button>
              )}
              {u.accountStatus !== 'active' && (
                <button
                  disabled={busyId === u.id}
                  onClick={() => act(api.adminReinstateUser, u.id)}
                  className="font-mono text-[10px] uppercase tracking-widest px-3 py-2 rounded-sprocket border border-reel/40 text-reel disabled:opacity-40"
                >
                  Reinstate
                </button>
              )}
              {u.role === 'user' ? (
                <button
                  disabled={busyId === u.id}
                  onClick={() => act(api.adminChangeRole, u.id, 'moderator')}
                  className="font-mono text-[10px] uppercase tracking-widest px-3 py-2 rounded-sprocket border border-smoke/30 text-smoke disabled:opacity-40"
                >
                  Make moderator
                </button>
              ) : (
                <button
                  disabled={busyId === u.id}
                  onClick={() => act(api.adminChangeRole, u.id, 'user')}
                  className="font-mono text-[10px] uppercase tracking-widest px-3 py-2 rounded-sprocket border border-smoke/30 text-smoke disabled:opacity-40"
                >
                  Revoke {u.role}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
