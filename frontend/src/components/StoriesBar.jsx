'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import StoryViewer from './StoryViewer';
import StoryComposer from './StoryComposer';

function Ring({ hasUnviewed, mine, children }) {
  // mine: a thin solid ring — "you have an active story", not a
  // notification to act on, so it doesn't compete visually with the
  // gradient reserved for other people's unviewed stories. hasUnviewed:
  // the gradient the spec calls for. Neither: muted gray (already seen).
  const ring = mine ? 'bg-amber-500' : hasUnviewed ? 'bg-gradient-to-tr from-yellow-500 via-red-500 to-purple-600' : 'bg-zinc-700';
  return (
    <span className={`block w-16 h-16 rounded-full p-[2.5px] ${ring}`}>
      <span className="block w-full h-full rounded-full border-2 border-black overflow-hidden bg-zinc-800">{children}</span>
    </span>
  );
}

function AvatarImg({ user }) {
  return user?.avatarUrl ? (
    <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
  ) : (
    <span className="w-full h-full flex items-center justify-center font-display text-amber-400 text-lg">
      {user?.username?.[0]?.toUpperCase() || '?'}
    </span>
  );
}

// Renders a horizontal, snap-free scrolling tray. No opinion of its own
// about fixed vs. in-flow positioning — the feed page decides that (see
// the usage note at the bottom of this file), since a full-bleed
// snap-scroll mobile feed and a normal-flow desktop layout need genuinely
// different placement, not just different widths.
export default function StoriesBar({ className = '' }) {
  const { user, isAuthenticated } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState(null); // index into `groups`, or null
  const [showComposer, setShowComposer] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    api
      .getStoriesFeed()
      .then(setGroups)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  function handleCreated(story) {
    setShowComposer(false);
    setGroups((prev) => {
      const mine = prev.find((g) => g.user.id === user.id);
      if (mine) {
        return prev.map((g) => (g.user.id === user.id ? { ...g, stories: [...g.stories, story] } : g));
      }
      return [{ user, hasUnviewed: false, stories: [story] }, ...prev];
    });
  }

  if (!isAuthenticated) return null;

  const myGroup = groups.find((g) => g.user.id === user.id);
  const otherGroups = groups.filter((g) => g.user.id !== user.id);
  // Own slot always renders regardless of `groups` — first-run/no-stories
  // state still needs the Add Story affordance visible.
  const orderedGroups = myGroup ? [myGroup, ...otherGroups] : otherGroups;

  return (
    <>
      <div className={`flex gap-3 overflow-x-auto no-scrollbar px-4 py-3 ${className}`}>
        <div className="flex flex-col items-center gap-1 shrink-0 w-16">
          <button
            onClick={() => (myGroup ? setViewerIndex(0) : setShowComposer(true))}
            className="relative"
            aria-label={myGroup ? 'View your story' : 'Add a story'}
          >
            {myGroup ? (
              <Ring mine>
                <AvatarImg user={user} />
              </Ring>
            ) : (
              <span className="block w-16 h-16 rounded-full border-2 border-zinc-700 overflow-hidden bg-zinc-800">
                <AvatarImg user={user} />
              </span>
            )}
            <span
              role="button"
              tabIndex={0}
              aria-label="Add story"
              onClick={(e) => {
                e.stopPropagation();
                setShowComposer(true);
              }}
              className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-amber-500 text-black flex items-center justify-center border-2 border-black text-xs font-bold leading-none"
            >
              +
            </span>
          </button>
          <span className="font-body text-[11px] text-white truncate max-w-[64px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            Your story
          </span>
        </div>

        {loading &&
          [0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1 shrink-0 w-16">
              <span className="block w-16 h-16 rounded-full bg-zinc-800 animate-pulse" />
            </div>
          ))}

        {!loading &&
          otherGroups.map((g) => (
            <button
              key={g.user.id}
              onClick={() => setViewerIndex(orderedGroups.findIndex((og) => og.user.id === g.user.id))}
              className="flex flex-col items-center gap-1 shrink-0 w-16"
            >
              <Ring hasUnviewed={g.hasUnviewed}>
                <AvatarImg user={g.user} />
              </Ring>
              <span className="font-body text-[11px] text-white truncate max-w-[64px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                @{g.user.username}
              </span>
            </button>
          ))}
      </div>

      {viewerIndex !== null && (
        <StoryViewer
          groups={orderedGroups}
          initialGroupIndex={viewerIndex}
          currentUserId={user.id}
          onClose={() => setViewerIndex(null)}
          onStoryUpdate={(storyId, patch) => {
            setGroups((prev) => {
              const next = prev.map((g) => ({
                ...g,
                stories: g.stories.map((s) => (s.id === storyId ? { ...s, ...patch } : s)),
              }));
              // Recompute hasUnviewed for whichever group just changed —
              // patch is most commonly { viewed: true }, and the tray ring
              // needs to flip the moment the last unviewed story in a
              // group gets marked viewed, not just on next fetch.
              return next.map((g) =>
                g.user.id === user.id ? g : { ...g, hasUnviewed: g.stories.some((s) => !s.viewed) }
              );
            });
          }}
          onDeleted={(storyId) => {
            setGroups((prev) =>
              prev
                .map((g) => ({ ...g, stories: g.stories.filter((s) => s.id !== storyId) }))
                .filter((g) => g.stories.length > 0)
            );
          }}
        />
      )}

      {showComposer && <StoryComposer onClose={() => setShowComposer(false)} onCreated={handleCreated} />}
    </>
  );
}

// ---------------------------------------------------------------------
// Example usage in the main feed (app/page.jsx):
//
// This app's mobile feed is a full-bleed, edge-to-edge snap-scroll video
// feed (each <VideoCard> is h-dvh) with its own `fixed top-0` nav bar
// already overlaying it — there's no normal-flow "top of the page" space
// to push content into without resizing every video card. Desktop uses a
// normal (non-fixed) <header>, so it has real flow space instead.
//
//   {!focusMode && isDesktop && (
//     <>
//       {desktopHeader}
//       <StoriesBar className="border-b border-zinc-800 bg-zinc-950/80" />
//     </>
//   )}
//   {!focusMode && isDesktop === false && (
//     <>
//       {mobileTopNav}
//       {/* Overlaid just below the (short) top nav bar, same z-index
//           family as mobileTopNav — not inside the snap-scroll container,
//           so it doesn't become its own swipe "page". */}
//       <div className="fixed inset-x-0 z-20" style={{ top: 'calc(env(safe-area-inset-top) + 3.25rem)' }}>
//         <StoriesBar />
//       </div>
//     </>
//   )}
// ---------------------------------------------------------------------
