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
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [trackVideos, setTrackVideos] = useState([]);
  const [trackVideosLoading, setTrackVideosLoading] = useState(mode === 'track-videos');
  const [trackVideosError, setTrackVideosError] = useState(null);
  const audioRef = useRef(null);
  const searchInputRef = useRef(null);

  // Browse mode: debounced search — fires once immediately on mount with an
  // empty query to seed the "trending" list.
  useEffect(() => {
    if (mode !== 'browse') return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const handle = setTimeout(
      () => {
        fetchSounds({ query: query.trim(), limit: 30 })
          .then((tracks) => {
            if (!cancelled) setResults(Array.isArray(tracks) ? tracks : []);
          })
          .catch(() => {
            if (!cancelled) setError("Couldn't load sounds — try again");
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
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  function togglePreview(track) {
    const el = audioRef.current;
    if (!el || !track.audioUrl) return;
    if (playingId === track.id) {
      el.pause();
      setPlayingId(null);
      return;
    }
    el.src = track.audioUrl;
    el.currentTime = 0;
    el.play().catch(() => {});
    setPlayingId(track.id);
  }

  function handleUseSound() {
    if (!selected) return;
    audioRef.current?.pause();
    onSelect?.({
      soundId: selected.id,
      soundUrl: selected.audioUrl,
      title: selected.title,
      artistName: selected.artistName,
    });
    onClose?.();
  }

  return (
    <div className="absolute inset-0 z-30 flex items-end">
      <div className="absolute inset-0 bg-ink/70" onClick={onClose} />
      {/* Hidden shared preview player — reused across rows so starting a new
          preview always stops whatever was playing before. */}
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} className="hidden" />

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
              playing={playingId === activeTrack.id}
              onTogglePreview={() => togglePreview(activeTrack)}
              onSelect={() => setSelected(activeTrack)}
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-3">
          {mode === 'browse' ? (
            <>
              {loading && (
                <div className="flex justify-center py-10">
                  <LoadingSpinner label="Loading sounds…" />
                </div>
              )}
              {!loading && error && (
                <p className="font-body text-sm text-red-400 text-center py-8">{error}</p>
              )}
              {!loading && !error && results.length === 0 && (
                <p className="font-body text-sm text-smoke text-center py-8">
                  {query ? `No sounds match "${query}"` : 'No sounds available yet'}
                </p>
              )}
              {!loading && !error && results.length > 0 && (
                <>
                  {!query && (
                    <p className="font-mono text-[10px] uppercase tracking-widest text-smoke mb-2">
                      Trending
                    </p>
                  )}
                  <div className="flex flex-col gap-1">
                    {results.map((track) => (
                      <TrackRow
                        key={track.id}
                        track={track}
                        selected={selected?.id === track.id}
                        playing={playingId === track.id}
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

function TrackRow({ track, selected, playing, onTogglePreview, onSelect }) {
  const duration = formatDuration(track.durationSeconds);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-2 py-2 rounded-sprocket border transition-colors text-left ${
        selected ? 'border-reel bg-reel/10' : 'border-transparent hover:bg-smoke/5'
      }`}
    >
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

      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePreview();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onTogglePreview();
          }
        }}
        aria-label={playing ? 'Pause preview' : 'Play preview'}
        className="w-8 h-8 rounded-full bg-ink border border-smoke/20 text-bone flex items-center justify-center shrink-0"
      >
        {playing ? <PauseIcon className="w-3.5 h-3.5" /> : <PlayIcon className="w-3.5 h-3.5 ml-0.5" />}
      </span>
    </button>
  );
}
