'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { LoadingSpinner } from './LoadingScreen';

/* ------------------------------------------------------------------ */
/* Icons                                                                */
/* ------------------------------------------------------------------ */

function MusicNoteIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" stroke="none">
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  );
}

function PlayIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" stroke="none">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" stroke="none">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function SearchIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CheckIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Tries a dedicated trending-sounds endpoint first (query + limit, matching
// what a real "trending" ranking would take) and falls back to the
// artist-distributed-tracks search that already ships in this app
// (GET /artists/tracks/search — see backend/src/routes/artists.js). Today
// that route has no actual trending signal (it's just createdAt desc), so
// results with an empty query are "recently added" rather than "trending"
// until the backend grows a real ranking — this keeps the picker working
// either way and picks up a real trending endpoint automatically once one
// exists.
async function fetchSounds({ query, limit = 30 } = {}) {
  if (typeof api.getTrendingSounds === 'function') {
    return api.getTrendingSounds({ query, limit });
  }
  return api.searchTracks(query || '');
}

// Local fallback so the picker never renders a dead end — used when the
// API call throws (offline, backend down, 5xx) or resolves with an empty
// list. These are royalty-free instrumental demo tracks (SoundHelix's
// public sample set), meant as placeholders only: swap `audioUrl` for
// real licensed tracks before shipping this to production.
const FALLBACK_TRACKS = [
  {
    id: 'fallback-1',
    title: 'Late Night Drive',
    artistName: 'Sample Sounds',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    durationSeconds: 237,
    isFallback: true,
  },
  {
    id: 'fallback-2',
    title: 'Golden Hour',
    artistName: 'Sample Sounds',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    durationSeconds: 202,
    isFallback: true,
  },
  {
    id: 'fallback-3',
    title: 'City Lights',
    artistName: 'Sample Sounds',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    durationSeconds: 227,
    isFallback: true,
  },
  {
    id: 'fallback-4',
    title: 'Slow Motion',
    artistName: 'Sample Sounds',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    durationSeconds: 259,
    isFallback: true,
  },
  {
    id: 'fallback-5',
    title: 'Morning Haze',
    artistName: 'Sample Sounds',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    durationSeconds: 320,
    isFallback: true,
  },
];

function matchesFallbackQuery(track, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return track.title.toLowerCase().includes(q) || track.artistName.toLowerCase().includes(q);
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

// A slide-up sheet for browsing/selecting audio. Two modes:
//   - 'browse' (default): search + trending list, for attaching a sound
//     while creating a reel.
//   - 'track-videos': opened from the vinyl badge on a reel that already
//     has a sound attached — shows that track up top plus other reels
//     using it, TikTok "sound page" style.
export default function SoundPicker({
  onClose,
  onSelect,
  selectedTrackId = null,
  mode = 'browse',
  activeTrack = null, // { id, title, artistName, audioUrl, durationSeconds } — required for 'track-videos'
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [selected, setSelected] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackVideos, setTrackVideos] = useState([]);
  const [trackVideosLoading, setTrackVideosLoading] = useState(mode === 'track-videos');
  const [trackVideosError, setTrackVideosError] = useState(null);
  const audioRef = useRef(null);
  const searchInputRef = useRef(null);
  const pendingPlayRef = useRef(null);
  const mountedRef = useRef(true);

  // Browse mode: debounced search — fires once immediately on mount with an
  // empty query to seed the "trending" list.
  useEffect(() => {
    if (mode !== 'browse') return;
    let cancelled = false;
    setLoading(true);
    const trimmed = query.trim();
    const handle = setTimeout(
      () => {
        fetchSounds({ query: trimmed, limit: 30 })
          .then((tracks) => {
            if (cancelled) return;
            const list = Array.isArray(tracks) ? tracks : [];
            if (list.length > 0) {
              setResults(list);
              setUsingFallback(false);
            } else {
              // Empty (not an error) — API is reachable but has nothing to
              // show yet, so fall back locally rather than dead-ending the
              // picker on a blank list.
              setResults(FALLBACK_TRACKS.filter((t) => matchesFallbackQuery(t, trimmed)));
              setUsingFallback(true);
            }
          })
          .catch(() => {
            if (cancelled) return;
            // API unreachable/failed — same fallback, so the picker keeps
            // working offline instead of showing a dead error state.
            setResults(FALLBACK_TRACKS.filter((t) => matchesFallbackQuery(t, trimmed)));
            setUsingFallback(true);
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      query ? 300 : 0
    );
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [mode, query]);

  // track-videos mode: pull in other reels using this same sound. No such
  // endpoint exists on the backend yet (Track has no reverse "videos using
  // this track" route) — this degrades to a friendly empty state instead
  // of throwing once api.getTrackVideos is wired up server-side.
  useEffect(() => {
    if (mode !== 'track-videos' || !activeTrack?.id) return;
    let cancelled = false;
    setTrackVideosLoading(true);
    setTrackVideosError(null);
    const call =
      typeof api.getTrackVideos === 'function'
        ? api.getTrackVideos(activeTrack.id)
        : Promise.reject(new Error('not available'));
    call
      .then((videos) => {
        if (!cancelled) setTrackVideos(Array.isArray(videos) ? videos : []);
      })
      .catch(() => {
        if (!cancelled) setTrackVideosError("Reel listing for this sound isn't available yet");
      })
      .finally(() => {
        if (!cancelled) setTrackVideosLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, activeTrack?.id]);

  // Preselect the currently-attached sound, if any, so it opens highlighted.
  useEffect(() => {
    if (mode === 'track-videos' && activeTrack) {
      setSelected(activeTrack);
    }
  }, [mode, activeTrack]);

  useEffect(() => {
    if (mode === 'browse' && selectedTrackId && results.length) {
      const match = results.find((t) => t.id === selectedTrackId);
      if (match) setSelected(match);
    }
  }, [mode, selectedTrackId, results]);

  // Stop preview audio on close/unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      audioRef.current?.pause();
      setIsPlaying(false);
    };
  }, []);

  // Whenever a different track becomes "current" (new selection, or the
  // active track cleared), stop any playback so the picker never has audio
  // running for a track that's no longer the one shown as playing.
  useEffect(() => {
    if (playingId === null) {
      audioRef.current?.pause();
    }
  }, [playingId]);

  function togglePreview(track) {
    const el = audioRef.current;
    if (!el || !track.audioUrl) return;

    // This track is already the current preview target — pause/stop it.
    // Branch on playingId alone, NOT isPlaying: isPlaying only flips true
    // once the browser has actually started audible playback, which lags
    // a beat behind the click while it buffers. A second tap landing in
    // that gap (easy to trigger on mobile) would otherwise fall through
    // to the "start fresh" branch below and call pause() on a play()
    // request that's still pending — which throws an AbortError and made
    // the preview look like it stopped itself right after starting.
    if (playingId === track.id) {
      const pending = pendingPlayRef.current;
      if (pending) {
        // Let the in-flight play() settle before pausing it, instead of
        // interrupting it.
        pending.then(() => el.pause()).catch(() => {});
      } else {
        el.pause();
      }
      setPlayingId(null);
      setIsPlaying(false);
      return;
    }

    // New track, or restarting one that finished/errored — force the
    // element to pick up the source before playing. Some mobile browsers
    // (notably iOS Safari) don't reliably swap audio sources on a bare
    // `src` assignment without an explicit `load()`.
    el.pause();
    el.src = track.audioUrl;
    el.load();
    el.currentTime = 0;
    setPlayingId(track.id);
    const playPromise = el.play();
    pendingPlayRef.current = playPromise;
    playPromise
      .then(() => {
        if (!mountedRef.current) return;
        setIsPlaying(true);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        // Autoplay was blocked, or the source failed to load — don't leave
        // the UI showing a "playing" state for audio that never started.
        setIsPlaying(false);
        setPlayingId((current) => (current === track.id ? null : current));
      })
      .finally(() => {
        if (pendingPlayRef.current === playPromise) pendingPlayRef.current = null;
      });
  }

  function handleUseSound() {
    if (!selected) return;
    audioRef.current?.pause();
    setIsPlaying(false);
    onSelect?.({
      soundId: selected.id,
      soundUrl: selected.audioUrl,
      title: selected.title,
      artistName: selected.artistName,
    });
    onClose?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-stretch justify-end">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-lg" onClick={onClose} />
      {/* Hidden shared preview player — reused across rows so starting a new
          preview always stops whatever was playing before. */}
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setPlayingId(null);
          setIsPlaying(false);
        }}
        onError={() => {
          setPlayingId(null);
          setIsPlaying(false);
        }}
        className="hidden"
      />

      <div className="relative w-full max-h-[80%] bg-ink2/95 backdrop-blur-xl border-t border-smoke/20 rounded-t-2xl flex flex-col animate-sheet-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-smoke/10 shrink-0">
          <span className="w-6" />
          <p className="font-display text-xl text-bone tracking-wide">
            {mode === 'track-videos' ? 'Sound' : 'Sounds'}
          </p>
          <button onClick={onClose} className="text-smoke text-lg font-body leading-none" aria-label="Close">
            ✕
          </button>
        </div>

        {mode === 'browse' && (
          <div className="px-6 py-3 border-b border-smoke/10 shrink-0">
            <div className="flex items-center gap-2 bg-ink rounded-sprocket border border-smoke/20 px-3 py-2">
              <SearchIcon className="w-4 h-4 text-smoke shrink-0" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sounds or artists"
                className="flex-1 bg-transparent font-body text-sm text-bone placeholder:text-smoke outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="text-smoke text-sm font-body leading-none shrink-0"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {mode === 'track-videos' && activeTrack && (
          <div className="px-6 py-4 border-b border-smoke/10 shrink-0">
            <TrackRow
              track={activeTrack}
              selected
              playing={playingId === activeTrack.id && isPlaying}
              onTogglePreview={() => togglePreview(activeTrack)}
              onSelect={() => setSelected(activeTrack)}
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-3">
          {mode === 'browse' ? (
            <>
              {loading && <TrackRowSkeletons count={6} />}
              {!loading && results.length === 0 && (
                // Shouldn't normally happen — FALLBACK_TRACKS always backs
                // the list — but a query that matches nothing in the
                // fallback set either still lands here cleanly.
                <p className="font-body text-sm text-smoke text-center py-8">
                  {query ? `No sounds match "${query}"` : 'No sounds available yet'}
                </p>
              )}
              {!loading && results.length > 0 && (
                <>
                  {!query && (
                    <p className="font-mono text-[10px] uppercase tracking-widest text-smoke mb-2">
                      {usingFallback ? 'Suggested sounds' : 'Trending'}
                    </p>
                  )}
                  {usingFallback && (
                    <p className="font-body text-xs text-smoke/70 mb-2">
                      Couldn't reach the sound library — showing sample tracks instead.
                    </p>
                  )}
                  <div className="flex flex-col gap-1">
                    {results.map((track) => (
                      <TrackRow
                        key={track.id}
                        track={track}
                        selected={selected?.id === track.id}
                        playing={playingId === track.id && isPlaying}
                        onTogglePreview={() => togglePreview(track)}
                        onSelect={() => setSelected(track)}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <p className="font-mono text-[10px] uppercase tracking-widest text-smoke mb-3">
                Reels using this sound
              </p>
              {trackVideosLoading && (
                <div className="flex justify-center py-10">
                  <LoadingSpinner label="Loading reels…" />
                </div>
              )}
              {!trackVideosLoading && trackVideosError && (
                <p className="font-body text-sm text-smoke text-center py-8">{trackVideosError}</p>
              )}
              {!trackVideosLoading && !trackVideosError && trackVideos.length === 0 && (
                <p className="font-body text-sm text-smoke text-center py-8">
                  No other reels use this sound yet.
                </p>
              )}
              {!trackVideosLoading && !trackVideosError && trackVideos.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5">
                  {trackVideos.map((v) => (
                    <a
                      key={v.id}
                      href={`/?video=${v.id}`}
                      className="relative aspect-[9/16] bg-ink rounded-sprocket overflow-hidden"
                    >
                      {v.thumbnailUrl ? (
                        <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-smoke">
                          <MusicNoteIcon className="w-6 h-6" />
                        </div>
                      )}
                      <span className="absolute bottom-1 left-1 font-body text-[10px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                        @{v.user?.username}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-smoke/10 shrink-0">
          <button
            onClick={handleUseSound}
            disabled={!selected}
            className="w-full bg-reel text-ink font-body font-semibold py-3 rounded-sprocket disabled:opacity-40 disabled:pointer-events-none"
          >
            {selected ? `Use "${selected.title}"` : 'Use This Sound'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TrackRowSkeletons({ count = 6 }) {
  return (
    <div className="flex flex-col gap-1 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-full flex items-center gap-3 px-2 py-2">
          <span className="w-12 h-12 rounded-sprocket bg-smoke/10 shrink-0" />
          <span className="flex-1 min-w-0 space-y-1.5">
            <span className="block h-3 w-2/5 rounded bg-smoke/10" />
            <span className="block h-2.5 w-1/4 rounded bg-smoke/10" />
          </span>
          <span className="w-8 h-8 rounded-full bg-smoke/10 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function TrackRow({ track, selected, playing, onTogglePreview, onSelect }) {
  const duration = formatDuration(track.durationSeconds);
  return (
    // Two sibling buttons, not one nested inside the other. The previous
    // version wrapped the whole row in a real <button> (for onSelect) and
    // put the play/pause toggle in a `<span role="button">` *inside* it —
    // interactive content nested inside a <button> is invalid HTML, and in
    // practice several mobile browsers (iOS Safari in particular) don't
    // reliably hit-test a nested pseudo-button against the native
    // <button>'s own aggressive touch handling: taps on the inner preview
    // control could get swallowed or misrouted to the outer row instead.
    // That's what "selected sounds fail to play" actually was — the tap
    // never reliably reached onTogglePreview at all on affected devices.
    <div
      className={`w-full flex items-center gap-3 px-2 py-2 rounded-sprocket border transition-colors ${
        selected ? 'border-reel bg-reel/10' : 'border-transparent hover:bg-smoke/5'
      }`}
    >
      <button type="button" onClick={onSelect} className="flex-1 flex items-center gap-3 min-w-0 text-left">
        <span className="relative w-12 h-12 rounded-sprocket overflow-hidden shrink-0 bg-gradient-to-br from-reel/30 to-ink2 border border-smoke/10">
          {track.coverUrl ? (
            <img src={track.coverUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-reel">
              <MusicNoteIcon className="w-5 h-5" />
            </span>
          )}
        </span>

        <span className="flex-1 min-w-0">
          <span className="block font-body text-sm text-bone truncate">{track.title}</span>
          <span className="block font-body text-xs text-smoke truncate">
            {track.artistName}
            {duration ? ` · ${duration}` : ''}
            {track.genre ? ` · ${track.genre}` : ''}
          </span>
        </span>

        {selected && (
          <span className="w-5 h-5 rounded-full bg-reel text-ink flex items-center justify-center shrink-0">
            <CheckIcon className="w-3 h-3" />
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={onTogglePreview}
        aria-label={playing ? 'Pause preview' : 'Play preview'}
        className="w-8 h-8 rounded-full bg-ink border border-smoke/20 text-bone flex items-center justify-center shrink-0"
      >
        {playing ? <SoundwaveIcon className="w-4 h-4 text-reel" /> : <PlayIcon className="w-3.5 h-3.5 ml-0.5" />}
      </button>
    </div>
  );
}

// Three bars animated at staggered speeds — a quick, unambiguous "this one
// is playing" signal distinct from the plain pause glyph a static icon
// would show, without needing a whole waveform asset.
function SoundwaveIcon({ className = '' }) {
  return (
    <span className={`flex items-end gap-0.5 h-3.5 ${className}`} aria-hidden="true">
      <span className="w-0.5 bg-current rounded-full animate-[soundwave_0.9s_ease-in-out_infinite]" style={{ height: '40%' }} />
      <span className="w-0.5 bg-current rounded-full animate-[soundwave_0.9s_ease-in-out_infinite_0.15s]" style={{ height: '100%' }} />
      <span className="w-0.5 bg-current rounded-full animate-[soundwave_0.9s_ease-in-out_infinite_0.3s]" style={{ height: '65%' }} />
      <style jsx>{`
        @keyframes soundwave {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(1); }
        }
      `}</style>
    </span>
  );
}
