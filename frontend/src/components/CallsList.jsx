'use client';

import { useRouter } from 'next/navigation';
import { Phone, Video } from 'lucide-react';
import { useCall } from '../context/CallContext';
import { describeCall, formatCallTime, TONE_TEXT } from '../lib/callLogs';
import CallLogIcon from './CallLogIcon';
import { LoadingSpinner } from './LoadingScreen';

function Avatar({ user }) {
  return (
    <span className="w-12 h-12 rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center font-display text-amber-400 shrink-0">
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        (user?.displayName || user?.username)?.[0]?.toUpperCase()
      )}
    </span>
  );
}

// Calls tab body: one card per call with a one-tap callback.
export default function CallsList({ calls, loading, search = '' }) {
  const router = useRouter();
  const { startCall, inCall } = useCall();

  const q = search.trim().toLowerCase();
  const visible = q
    ? calls.filter((c) => `${c.peer?.username || ''} ${c.peer?.displayName || ''}`.toLowerCase().includes(q))
    : calls;

  if (loading) return <LoadingSpinner label="Loading…" />;
  if (visible.length === 0) {
    return (
      <p className="font-body text-zinc-500 text-xs p-3">
        {q ? 'No matches.' : 'No calls yet — tap the phone or video icon in a chat to start one.'}
      </p>
    );
  }

  return visible.map((log) => {
    const info = describeCall(log);
    const isVideo = log.callType === 'VIDEO';
    const peerName = log.peer?.displayName || `@${log.peer?.username}`;
    return (
      <div key={log.id} className="flex items-center gap-3.5 p-3 rounded-2xl hover:bg-neutral-800/50 transition">
        <button
          onClick={() => router.push(`/messages/${log.peer.id}`)}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
          aria-label={`Open chat with ${peerName}`}
        >
          <Avatar user={log.peer} />
          <div className="min-w-0">
            <p className={`font-bold text-sm truncate ${info.tone === 'red' ? 'text-red-400' : 'text-white'}`}>{peerName}</p>
            <p className={`text-xs font-semibold flex items-center gap-1.5 truncate ${TONE_TEXT[info.tone]}`}>
              <CallLogIcon kind={info.kind} tone={info.tone} isVideo={isVideo} />
              <span className="truncate">{info.label}</span>
              <span className="text-zinc-500 font-medium shrink-0">· {formatCallTime(log.createdAt)}</span>
            </p>
          </div>
        </button>
        <button
          onClick={() => startCall(log.peer, isVideo ? 'video' : 'voice')}
          disabled={inCall}
          aria-label={`${isVideo ? 'Video' : 'Voice'} call ${peerName}`}
          className="w-10 h-10 shrink-0 rounded-full bg-zinc-800 hover:bg-zinc-700 text-amber-400 flex items-center justify-center border border-zinc-700 transition active:scale-95 disabled:opacity-40"
        >
          {isVideo ? <Video size={18} /> : <Phone size={18} />}
        </button>
      </div>
    );
  });
}
