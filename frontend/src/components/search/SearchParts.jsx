'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  Flame,
  Music2,
  Play,
  SearchX,
  TriangleAlert,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

// 12400 -> "12.4K". BigInt counts arrive as numbers/strings via the backend's
// BigInt.prototype.toJSON, so Number() normalises both.
export function formatCount(n) {
  const v = Number(n);
  return Number.isFinite(v) ? compact.format(v) : '0';
}

const pluralize = (n, one, many) => `${formatCount(n)} ${Number(n) === 1 ? one : many}`;

// Splits videos into two columns, always dropping the next item into the
// shorter column. Heights are estimated (thumbnail + caption), which is what
// makes it a masonry layout rather than a plain two-column grid.
function splitColumns(videos) {
  const cols = [[], []];
  const heights = [0, 0];
  videos.forEach((v) => {
    const est = 1.33 + (v.caption ? 0.25 + Math.min(v.caption.length, 80) / 80 * 0.2 : 0) + 0.2;
    const i = heights[0] <= heights[1] ? 0 : 1;
    cols[i].push(v);
    heights[i] += est;
  });
  return cols;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export function Avatar({ src, name = '', className = 'w-10 h-10' }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || '?').replace(/^@/, '').charAt(0).toUpperCase();

  return (
    <span
      className={`${className} rounded-full overflow-hidden bg-neutral-700 shrink-0 flex items-center justify-center text-white font-bold`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span aria-hidden="true" className="text-[0.9em]">{initial}</span>
      )}
    </span>
  );
}

export function CreatorBadge() {
  return (
    <BadgeCheck
      aria-label="Creator"
      className="w-4 h-4 text-amber-500 shrink-0"
      strokeWidth={2.5}
    />
  );
}

export function FollowButton({ following, pending, onClick, username }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={following}
      aria-label={following ? `Unfollow @${username}` : `Follow @${username}`}
      className={`h-8 px-4 rounded-full text-sm font-bold shrink-0 transition-colors active:scale-95 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
        following
          ? 'bg-neutral-700 text-white hover:bg-neutral-600'
          : 'bg-amber-500 text-neutral-950 hover:bg-amber-400'
      }`}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
}

export function SectionHeader({ title, actionLabel, onAction }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="text-sm font-semibold text-amber-500 hover:text-amber-400 py-1 pl-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export function UserRow({ user, followState, onToggleFollow, onOpen, showFollow }) {
  const { following, pending, followerCount } = followState;

  return (
    <div className="flex items-center gap-3 py-3">
      <Link
        href={`/profile/${user.id}`}
        onClick={onOpen}
        className="flex items-center gap-3 flex-1 min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-lg"
      >
        <Avatar src={user.avatarUrl} name={user.username} className="w-12 h-12 text-lg" />
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-base font-bold text-white leading-tight">
            <span className="truncate">@{user.username}</span>
            {user.creatorStatus && <CreatorBadge />}
          </p>
          {user.displayName && (
            <p className="text-sm text-neutral-300 truncate leading-tight mt-0.5">
              {user.displayName}
            </p>
          )}
          {typeof followerCount === 'number' && (
            <p className="text-xs text-neutral-400 mt-0.5">
              {pluralize(followerCount, 'follower', 'followers')}
            </p>
          )}
        </div>
      </Link>
      {showFollow && (
        <FollowButton
          following={following}
          pending={pending}
          onClick={onToggleFollow}
          username={user.username}
        />
      )}
    </div>
  );
}

// Compact card for the horizontal "Suggested creators" strip.
export function CreatorCard({ user, followState, onToggleFollow, onOpen, showFollow }) {
  const { following, pending, followerCount } = followState;

  return (
    <div className="w-32 shrink-0 snap-start rounded-2xl bg-neutral-800/80 p-3 flex flex-col items-center text-center">
      <Link
        href={`/profile/${user.id}`}
        onClick={onOpen}
        className="flex flex-col items-center w-full min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-lg"
      >
        <Avatar src={user.avatarUrl} name={user.username} className="w-16 h-16 text-2xl" />
        <p className="flex items-center justify-center gap-1 w-full mt-2 text-sm font-bold text-white">
          <span className="truncate">@{user.username}</span>
          {user.creatorStatus && <CreatorBadge />}
        </p>
        <p className="text-xs text-neutral-400 h-4 mt-0.5 truncate w-full">
          {typeof followerCount === 'number'
            ? pluralize(followerCount, 'follower', 'followers')
            : ''}
        </p>
      </Link>
      {showFollow && (
        <div className="mt-2 w-full [&>button]:w-full">
          <FollowButton
            following={following}
            pending={pending}
            onClick={onToggleFollow}
            username={user.username}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hashtags
// ---------------------------------------------------------------------------

export function HashtagCard({ tag, count, rank, onSelect }) {
  const hot = rank != null && rank <= 3;

  return (
    <button
      type="button"
      onClick={() => onSelect(tag)}
      className="text-left rounded-2xl bg-neutral-800/80 p-3 min-w-0 transition-colors hover:bg-neutral-800 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
    >
      <div className="flex items-center justify-between">
        {rank != null ? (
          <span className="font-display text-2xl leading-none text-amber-500">#{rank}</span>
        ) : (
          <span />
        )}
        <Flame
          aria-label={hot ? 'Trending' : undefined}
          aria-hidden={hot ? undefined : true}
          className={`w-5 h-5 ${hot ? 'text-amber-500 fill-amber-500/30' : 'text-neutral-500'}`}
        />
      </div>
      <p className="mt-2 text-base font-bold text-white truncate">#{tag}</p>
      <p className="text-sm text-neutral-400">{pluralize(count, 'video', 'videos')}</p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Videos (2-column masonry)
// ---------------------------------------------------------------------------

function VideoTile({ video, onOpen }) {
  const creator = video.user;
  const creatorId = creator?.id ?? video.userId;

  return (
    <Link
      href={`/profile/${creatorId}`}
      onClick={onOpen}
      className="block mb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-xl"
    >
      <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-neutral-800">
        {video.thumbnailUrl && (
          <img
            src={video.thumbnailUrl}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
        <span className="absolute bottom-2 left-2 flex items-center gap-1 text-xs font-bold text-white">
          <Play className="w-3.5 h-3.5 fill-white" aria-hidden="true" />
          {formatCount(video.viewCount)}
          <span className="sr-only"> plays</span>
        </span>
      </div>
      {video.caption && (
        <p className="mt-2 text-sm text-white leading-snug line-clamp-2 break-words">
          {video.caption}
        </p>
      )}
      <div className="mt-1.5 flex items-center gap-1.5 min-w-0">
        <Avatar src={creator?.avatarUrl} name={creator?.username} className="w-5 h-5 text-[10px]" />
        <span className="text-xs text-neutral-400 truncate">@{creator?.username}</span>
      </div>
    </Link>
  );
}

export function VideoMasonry({ videos, onOpen }) {
  const [left, right] = splitColumns(videos);
  return (
    <div className="grid grid-cols-2 gap-x-3 items-start">
      <div className="min-w-0">
        {left.map((v) => <VideoTile key={v.id} video={v} onOpen={onOpen} />)}
      </div>
      <div className="min-w-0">
        {right.map((v) => <VideoTile key={v.id} video={v} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sounds
// ---------------------------------------------------------------------------

export function SoundRow({ sound }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="w-12 h-12 rounded-xl bg-neutral-800 flex items-center justify-center shrink-0">
        <Music2 className="w-5 h-5 text-amber-500" aria-hidden="true" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-white truncate leading-tight">{sound.title}</p>
        <p className="text-sm text-neutral-400 truncate mt-0.5">
          {sound.artistName}
          {typeof sound.useCount === 'number' && ` · ${pluralize(sound.useCount, 'video', 'videos')}`}
        </p>
      </div>
      <Link
        href={`/upload?trackId=${sound.id}`}
        aria-label={`Use sound ${sound.title}`}
        className="h-8 px-4 inline-flex items-center rounded-full bg-neutral-700 text-white text-sm font-bold shrink-0 hover:bg-neutral-600 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        Use
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeletons
// ---------------------------------------------------------------------------

const bone = 'bg-neutral-800 animate-pulse motion-reduce:animate-none';

export function UserListSkeleton({ rows = 5 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <span className={`w-12 h-12 rounded-full ${bone}`} />
          <div className="flex-1 space-y-2">
            <div className={`h-3.5 w-1/3 rounded ${bone}`} />
            <div className={`h-3 w-1/2 rounded ${bone}`} />
          </div>
          <div className={`h-8 w-20 rounded-full ${bone}`} />
        </div>
      ))}
    </div>
  );
}

export function HashtagGridSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-2 gap-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-neutral-800/50 p-3 space-y-2">
          <div className={`h-6 w-8 rounded ${bone}`} />
          <div className={`h-4 w-3/4 rounded ${bone}`} />
          <div className={`h-3 w-1/2 rounded ${bone}`} />
        </div>
      ))}
    </div>
  );
}

export function VideoGridSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <div className={`aspect-[3/4] rounded-xl ${bone}`} />
          <div className={`h-3.5 w-5/6 rounded mt-2 ${bone}`} />
          <div className={`h-3 w-1/3 rounded mt-2 ${bone}`} />
        </div>
      ))}
    </div>
  );
}

export function CreatorStripSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="w-32 shrink-0 rounded-2xl bg-neutral-800/50 p-3 flex flex-col items-center">
          <span className={`w-16 h-16 rounded-full ${bone}`} />
          <div className={`h-3.5 w-20 rounded mt-3 ${bone}`} />
          <div className={`h-8 w-full rounded-full mt-4 ${bone}`} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty / error states
// ---------------------------------------------------------------------------

export function EmptyState({ title, hint, suggestions = [], onPickSuggestion }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12">
      <span className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center">
        <SearchX className="w-7 h-7 text-neutral-400" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-bold text-white break-words max-w-full">{title}</h2>
      {hint && <p className="mt-1 text-sm text-neutral-400 max-w-xs">{hint}</p>}
      {suggestions.length > 0 && (
        <>
          <p className="mt-6 text-sm font-semibold text-neutral-300">Try searching for</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onPickSuggestion(s)}
                className="h-9 px-4 rounded-full bg-neutral-800 text-sm font-semibold text-white hover:bg-neutral-700 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ErrorState({ onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center text-center px-6 py-12">
      <span className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center">
        <TriangleAlert className="w-7 h-7 text-amber-500" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-bold text-white">Couldn’t load results</h2>
      <p className="mt-1 text-sm text-neutral-400 max-w-xs">
        Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 h-10 px-6 rounded-full bg-amber-500 text-neutral-950 text-sm font-bold hover:bg-amber-400 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        Try again
      </button>
    </div>
  );
}
