'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import ThreeDotCrossingLoader from './ThreeDotCrossingLoader';
import { api } from '@/lib/api';

// The page that slides in when you swipe left on a feed video: the creator's profile at a glance.
// Loads only once `enabled` (the first time the pager is touched), then keeps the result per creator.
export default function CreatorPreview({ creator, enabled, onBack, onOpenVideo, onToggleFollow, bottomPad = 0 }) {
  const id = creator?.id;
  const [profile, setProfile] = useState(null);
  const [videos, setVideos] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled || !id) return undefined;
    let alive = true;
    setProfile(null);
    setVideos(null);
    setFailed(false);
    api.getUser(id)
      .then((u) => alive && setProfile(u))
      .catch(() => alive && setFailed(true));
    api.getUserVideos(id)
      .then((v) => alive && setVideos(Array.isArray(v) ? v : []))
      .catch(() => alive && setVideos([]));
    return () => { alive = false; };
  }, [enabled, id]);

  if (!creator) return <div className="h-full bg-ink" />;
  const name = profile?.displayName || creator.displayName || creator.username;
  const avatar = profile?.avatarUrl || creator.avatarUrl;
  const following = creator.isFollowing ?? profile?.isFollowing;
  const stat = (n, label) => (
    <div className="text-center">
      <p className="font-extrabold text-lg text-white tabular-nums">{n ?? 0}</p>
      <p className="text-[11px] text-zinc-400 uppercase tracking-wide">{label}</p>
    </div>
  );

  return (
    <div className="h-full w-full bg-ink text-white overflow-y-auto overscroll-contain" style={{ paddingBottom: bottomPad + 16 }}>
      <div className="sticky top-0 z-10 flex items-center gap-2 px-2 py-2 bg-ink/90 backdrop-blur">
        <button type="button" onClick={onBack} aria-label="Back to feed" className="p-2 rounded-full active:bg-white/10">
          <ChevronLeft size={24} />
        </button>
        <p className="font-extrabold truncate">@{creator.username}</p>
      </div>

      <div className="flex flex-col items-center px-6 pt-4 gap-3">
        <div className="w-24 h-24 rounded-full overflow-hidden bg-zinc-800 border-2 border-white/20">
          {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : null}
        </div>
        <div className="text-center">
          <h2 className="text-lg font-extrabold">{name}</h2>
          {profile?.bio && <p className="mt-1 text-sm text-zinc-300 line-clamp-3 break-words">{profile.bio}</p>}
        </div>
        <div className="flex gap-8 mt-1">
          {stat(profile?._count?.following, 'Following')}
          {stat(profile?._count?.followers, 'Followers')}
          {stat(profile?.totalLikes, 'Likes')}
        </div>
        <div className="flex gap-2 w-full max-w-xs">
          <button
            type="button"
            onClick={() => onToggleFollow?.(id)}
            className={`flex-1 py-2.5 rounded-lg font-bold text-sm ${following ? 'bg-zinc-800 text-white' : 'bg-[#fe2c55] text-white'}`}
          >
            {following ? 'Following' : 'Follow'}
          </button>
          <Link href={`/profile/${id}`} className="flex-1 py-2.5 rounded-lg font-bold text-sm bg-zinc-800 text-center">
            Full profile
          </Link>
        </div>
      </div>

      <div className="mt-6">
        {failed && <p className="text-center text-sm text-zinc-400 py-6">Something went wrong. Please try again.</p>}
        {!failed && videos === null && <div className="flex justify-center py-10"><ThreeDotCrossingLoader /></div>}
        {videos?.length === 0 && !failed && <p className="text-center text-sm text-zinc-500 py-6">No videos yet.</p>}
        {videos?.length > 0 && (
          <div className="grid grid-cols-3 gap-0.5">
            {videos.map((v) => (
              <button key={v.id} type="button" onClick={() => onOpenVideo?.(v.id)} className="relative aspect-[3/4] bg-zinc-900 block">
                {v.thumbnailUrl && <img src={v.thumbnailUrl} alt={v.caption || ''} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
