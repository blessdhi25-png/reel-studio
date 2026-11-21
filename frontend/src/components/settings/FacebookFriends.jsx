'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/friendlyError';
import { useToast } from '@/context/ToastContext';
import { SettingsGroup } from '@/components/settings/SettingsUI';

const SMALL = 'px-3 py-1.5 rounded-xl font-sans font-bold text-xs disabled:opacity-50';

// "Facebook Friends on ClipPulse": follow, message, or invite to the live stream you're hosting right now.
export default function FacebookFriends({ refreshKey }) {
  const toast = useToast();
  const [friends, setFriends] = useState(null);
  const [myLive, setMyLive] = useState(null);
  const [busy, setBusy] = useState({});
  const [invited, setInvited] = useState({});

  useEffect(() => {
    let alive = true;
    api.getFacebookFriends().then((f) => alive && setFriends(f)).catch(() => alive && setFriends([]));
    let me = null;
    try { me = JSON.parse(localStorage.getItem('user') || 'null'); } catch {}
    if (me?.id) api.getLiveStreams().then((s) => alive && setMyLive((s || []).find((x) => x.host?.id === me.id) || null)).catch(() => {});
    return () => { alive = false; };
  }, [refreshKey]);

  const setB = (id, v) => setBusy((b) => ({ ...b, [id]: v }));

  async function toggleFollow(f) {
    setB(f.id, true);
    try {
      if (f.isFollowing) await api.unfollowUser(f.id); else await api.followUser(f.id);
      setFriends((list) => list.map((x) => (x.id === f.id ? { ...x, isFollowing: !f.isFollowing } : x)));
    } catch (err) { toast.error(friendlyError(err)); } finally { setB(f.id, false); }
  }

  async function invite(f) {
    setB(f.id, true);
    try {
      await api.sendMessage(f.id, `Join my live stream on ClipPulse: ${window.location.origin}/live/${myLive.id}`);
      setInvited((i) => ({ ...i, [f.id]: true }));
    } catch (err) {
      toast.error(err?.status === 403 ? `You can’t message @${f.username}.` : friendlyError(err));
    } finally { setB(f.id, false); }
  }

  return (
    <SettingsGroup
      title="Facebook Friends on ClipPulse"
      footer={friends && !friends.length ? 'None of your Facebook friends have linked their Facebook account on ClipPulse yet. Facebook only shares friends who also use this app, so invite them to join and link.' : myLive ? undefined : 'Start a live stream to invite these friends to it.'}
    >
      {friends === null && <p className="px-4 py-4 text-sm text-slate-500 dark:text-neutral-400">Loading…</p>}
      {friends?.map((f) => (
        <div key={f.id} className="px-4 py-3 flex items-center gap-3">
          <Link href={`/profile/${f.id}`} className="flex items-center gap-3 min-w-0 flex-1">
            <span className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 dark:bg-neutral-800 flex items-center justify-center font-sans font-bold shrink-0">
              {f.avatarUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={f.avatarUrl} alt="" className="w-full h-full object-cover" /> : (f.username[0] || '?').toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block font-sans font-bold text-sm truncate">{f.displayName || f.username}</span>
              <span className="block text-xs text-slate-500 dark:text-neutral-400 truncate">@{f.username}{f.facebookName ? ` · ${f.facebookName} on Facebook` : ''}</span>
            </span>
          </Link>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" disabled={busy[f.id]} onClick={() => toggleFollow(f)} className={`${SMALL} ${f.isFollowing ? 'bg-slate-200 dark:bg-neutral-800 text-slate-800 dark:text-neutral-200' : 'bg-amber-500 text-black'}`}>
              {f.isFollowing ? 'Following' : 'Follow'}
            </button>
            <Link href={`/messages/${f.id}`} className={`${SMALL} bg-slate-200 dark:bg-neutral-800 text-slate-800 dark:text-neutral-200`}>Message</Link>
            {myLive && (
              <button type="button" disabled={busy[f.id] || invited[f.id]} onClick={() => invite(f)} className={`${SMALL} bg-red-600 text-white`}>
                {invited[f.id] ? 'Invited' : 'Invite'}
              </button>
            )}
          </div>
        </div>
      ))}
    </SettingsGroup>
  );
}
