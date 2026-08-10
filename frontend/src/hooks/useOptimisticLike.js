'use client';

import { useCallback, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';

// Manages optimistic like state for a single video: flips isLiked/likeCount
// instantly on tap, fires the API call in the background, and reverts with
// an error toast if it fails.
//
// The tricky part this exists to get right is rapid consecutive taps. The
// straightforward version of this (read `liked` from the closure to decide
// which endpoint to call, and to decide what to revert to) breaks the
// moment someone double-taps quickly: the second call's closure still sees
// the pre-first-tap value of `liked`, so it fires the *same* endpoint the
// first call did instead of the opposite one, and a failure in either call
// can revert state that a different, already-succeeded call already
// correctly updated. A ref tracks the authoritative current value
// synchronously (state updates are async/batched, refs aren't), and each
// call captures its own "what did I change, and what should I revert to if
// I fail" snapshot — a later call's success is never stomped by an earlier
// call's failure arriving out of order.
export function useOptimisticLike(videoId, initialLiked, initialCount) {
  const [liked, setLiked] = useState(Boolean(initialLiked));
  const [likeCount, setLikeCount] = useState(Number(initialCount || 0));
  const likedRef = useRef(Boolean(initialLiked));
  const toast = useToast();

  const toggleLike = useCallback(async () => {
    const wasLiked = likedRef.current;
    const nextLiked = !wasLiked;

    // Optimistic update — ref first (synchronous, so a second rapid call
    // reads the correct just-updated value), then state (for render).
    likedRef.current = nextLiked;
    setLiked(nextLiked);
    setLikeCount((c) => (nextLiked ? c + 1 : Math.max(0, c - 1)));

    try {
      if (wasLiked) {
        await api.unlikeVideo(videoId);
      } else {
        await api.likeVideo(videoId);
      }
    } catch {
      // Only revert if nothing has changed the like state since this
      // specific call made its optimistic update — if a second tap already
      // moved things further along, blindly flipping back here would undo
      // that instead of just this call's own failed change.
      if (likedRef.current === nextLiked) {
        likedRef.current = wasLiked;
        setLiked(wasLiked);
        setLikeCount((c) => (nextLiked ? Math.max(0, c - 1) : c + 1));
      }
      toast.error("Couldn't update like — check your connection and try again.");
    }
  }, [videoId, toast]);

  return { liked, likeCount, toggleLike };
}
