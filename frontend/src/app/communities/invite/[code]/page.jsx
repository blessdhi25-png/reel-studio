'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { LoadingSpinner } from '@/components/LoadingScreen';

export default function InvitePage({ params }) {
  const { code } = params;
  const router = useRouter();
  const toast = useToast();
  const { token, ready } = useAuth();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    api
      .getInvitePreview(code)
      .then((d) => !cancelled && setInfo(d))
      .catch((e) => !cancelled && setError(e?.message || 'This invite link is invalid or has been reset'));
    return () => {
      cancelled = true;
    };
  }, [code, ready]);

  async function join() {
    if (!token) {
      router.push('/login');
      return;
    }
    setBusy(true);
    try {
      const r = await api.joinCommunityViaInvite(code);
      toast.success(`Joined ${info?.name || 'the community'}`);
      router.replace(`/communities/${r.communityId}`);
    } catch (e) {
      toast.error(e?.message || "Couldn't join");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white px-4 pt-16 pb-36 flex justify-center">
      <div className="w-full max-w-sm">
        {!info && !error && <LoadingSpinner label="Loading invite…" />}
        {error && (
          <div className="text-center">
            <p className="font-extrabold text-lg">Invite unavailable</p>
            <p className="text-sm font-medium text-zinc-400 mt-1">{error}</p>
          </div>
        )}
        {info && (
          <div className="rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900">
            <div className="h-32 w-full bg-gradient-to-br from-amber-500 to-rose-600">
              {info.bannerUrl && <img src={info.bannerUrl} alt="" className="h-32 w-full object-cover" />}
            </div>
            <div className="p-5">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-400">
                You're invited{info.privacy === 'private' ? ' · Private community' : ''}
              </p>
              <h1 className="font-extrabold text-2xl tracking-tight mt-1">{info.name}</h1>
              {info.description && <p className="text-sm font-medium text-zinc-400 mt-2">{info.description}</p>}
              <p className="text-xs font-bold text-zinc-500 mt-3">
                {info.memberCount} {info.memberCount === 1 ? 'member' : 'members'}
              </p>
              {info.isJoined ? (
                <button onClick={() => router.replace(`/communities/${info.id}`)} className="w-full mt-5 py-3 rounded-xl bg-zinc-800 font-extrabold">
                  Open community
                </button>
              ) : (
                <button onClick={join} disabled={busy} className="w-full mt-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold disabled:opacity-50">
                  {busy ? 'Joining…' : token ? 'Join community' : 'Log in to join'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
