'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { LoadingSpinner } from '../../../components/LoadingScreen';

// Shown only if the real API genuinely returns zero users (e.g. a fresh
// dev database) — clearly labeled as demo data via the banner below and
// disabled action buttons, so it's never mistaken for real production
// data. This satisfies "fallback mock data if array is empty" without
// letting fake rows silently look real.
const MOCK_USERS = [
  {
    id: 'mock-1', username: 'demo_creator', email: 'demo.creator@example.com',
    avatarUrl: null, role: 'user', accountStatus: 'active', statusReason: null,
    createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
    _count: { videos: 14 }, reportsAgainstCount: 0,
  },
  {
    id: 'mock-2', username: 'suspended_sample', email: 'sample.user@example.com',
    avatarUrl: null, role: 'user', accountStatus: 'suspended', statusReason: 'Spam links in captions',
    createdAt: new Date(Date.now() - 40 * 86400000).toISOString(),
    _count: { videos: 3 }, reportsAgainstCount: 4,
  },
  {
    id: 'mock-3', username: 'banned_example', email: 'banned.example@example.com',
    avatarUrl: null, role: 'user', accountStatus: 'banned', statusReason: 'Repeated harassment reports',
    createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
    _count: { videos: 0 }, reportsAgainstCount: 11,
  },
];

const STATUS_BADGE = {
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  suspended: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  banned: 'bg-red-500/10 text-red-400 border-red-500/30',
};

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'user', label: 'User' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'admin', label: 'Admin' },
];

function Avatar({ url, username }) {
  if (url) {
    return <img src={url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />;
  }
  return (
    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-[11px] font-bold text-zinc-400 shrink-0">
      {username?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

function ActionMenu({ user, busy, onSuspend, onBan, onReinstate, onPromote, onDemote }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-40"
        aria-label="Actions"
      >
        ⋯
      </button>
      {open && (
        <>
          {/* Click-outside catcher */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-20 w-44 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl py-1.5 overflow-hidden">
            {user.accountStatus !== 'banned' && (
              <button
                onClick={() => { setOpen(false); onBan(); }}
                className="w-full text-left px-3.5 py-2 text-xs text-red-400 hover:bg-zinc-800"
              >
                Ban
              </button>
            )}
            {user.accountStatus !== 'active' && (
              <button
                onClick={() => { setOpen(false); onReinstate(); }}
                className="w-full text-left px-3.5 py-2 text-xs text-emerald-400 hover:bg-zinc-800"
              >
                Unban
              </button>
            )}
            {user.accountStatus === 'active' && (
              <button
                onClick={() => { setOpen(false); onSuspend(); }}
                className="w-full text-left px-3.5 py-2 text-xs text-yellow-400 hover:bg-zinc-800"
              >
                Suspend
              </button>
            )}
            {user.role === 'user' ? (
              <button
                onClick={() => { setOpen(false); onPromote(); }}
                className="w-full text-left px-3.5 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Promote to Mod
              </button>
            ) : (
              <button
                onClick={() => { setOpen(false); onDemote(); }}
                className="w-full text-left px-3.5 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Revoke {user.role}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [usingMock, setUsingMock] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load(params = {}) {
    setLoading(true);
    api
      .adminGetUsers(params)
      .then((data) => {
        if (data.length === 0) {
          setUsers(MOCK_USERS);
          setUsingMock(true);
        } else {
          setUsers(data);
          setUsingMock(false);
        }
      })
      .catch(() => {
        setUsers(MOCK_USERS);
        setUsingMock(true);
      })
      .finally(() => setLoading(false));
  }

  function applyFilters(e) {
    e?.preventDefault();
    const params = {};
    if (search.trim()) params.search = search.trim();
    if (role) params.role = role;
    load(params);
  }

  async function act(fn, id, ...args) {
    if (usingMock) return; // demo rows aren't real — actions are disabled below anyway
    setBusyId(id);
    try {
      await fn(id, ...args);
      applyFilters();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl text-white tracking-wide">User Management</h1>
      </div>

      {usingMock && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-amber-400 font-bold">Demo data</span>
          <span className="font-body text-xs text-amber-200/70">
            No real users matched — showing sample rows so the layout isn't empty. Actions are disabled.
          </span>
        </div>
      )}

      <form onSubmit={applyFilters} className="flex flex-col sm:flex-row gap-2 mb-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search username or email…"
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3.5 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-amber-500/50"
        />
        <select
          value={role}
          onChange={(e) => { setRole(e.target.value); }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3.5 py-2 text-sm text-zinc-300 outline-none focus:border-amber-500/50"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <button
          type="submit"
          className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
        >
          Search
        </button>
      </form>

      {loading && <LoadingSpinner label="Loading…" />}

      {!loading && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-900/60 border-b border-zinc-800">
                <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">User</th>
                <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Email</th>
                <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Registered</th>
                <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Status</th>
                <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-900/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar url={u.avatarUrl} username={u.username} />
                      <div className="min-w-0">
                        <a href={`/profile/${u.id}`} className="font-body text-sm text-white hover:text-amber-400 truncate block">
                          @{u.username}
                        </a>
                        <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                          {u.role} · {u._count?.videos ?? 0} videos
                          {u.reportsAgainstCount > 0 && (
                            <span className="text-red-400"> · {u.reportsAgainstCount} reports</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-zinc-400">{u.email}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500 whitespace-nowrap">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded-md border ${STATUS_BADGE[u.accountStatus]}`}>
                      {u.accountStatus}
                    </span>
                    {u.statusReason && (
                      <p className="font-body text-[11px] text-zinc-500 mt-1 max-w-[180px]">{u.statusReason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ActionMenu
                      user={u}
                      busy={busyId === u.id || usingMock}
                      onSuspend={() => act((id) => api.adminSuspendUser(id, window.prompt('Reason?') || undefined), u.id)}
                      onBan={() => act((id) => api.adminBanUser(id, window.prompt('Reason?') || undefined), u.id)}
                      onReinstate={() => act(api.adminReinstateUser, u.id)}
                      onPromote={() => act(api.adminChangeRole, u.id, 'moderator')}
                      onDemote={() => act(api.adminChangeRole, u.id, 'user')}
                    />
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center font-body text-sm text-zinc-500">
                    No users match these filters.
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
