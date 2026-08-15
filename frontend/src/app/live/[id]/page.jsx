'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useCameraDevices } from '@/lib/useCameraDevices';
import CameraDeviceSelect from '@/components/CameraDeviceSelect';

const CATEGORIES = ['All', 'Gaming', 'Music', 'Chatting', 'Tech'];

// The backend doesn't persist a stream category yet, so we derive a stable
function formatViewers(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return `${n}`;
}

export default function LiveBrowsePage() {
  const router = useRouter();
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [showGoLive, setShowGoLive] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    setCurrentUser(JSON.parse(localStorage.getItem('user') || 'null'));
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .getLiveStreams(activeCategory)
      .then(setStreams)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeCategory]);

  const enriched = useMemo(
    () => streams.map((s) => ({ ...s, viewers: Math.max(s.peakViewers || 0, 1) })),
    [streams]
  );

  const [featured, ...rest] = enriched;

  function openGoLive() {
    if (typeof window === 'undefined' || !window.localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    setShowGoLive(true);
  }

  function handleStarted(stream) {
    setShowGoLive(false);
    router.push(`/live/${stream.id}`);
  }

  return (
    <main className="max-w-7xl mx-auto p-6 md:p-8 space-y-8 min-h-screen bg-zinc-950 text-white">
      {/* Header Bar */}
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Live Streams</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Jump into a live room — camera, mic, and chat, all in real time.
            </p>
          </div>
          <button
            onClick={openGoLive}
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg flex items-center gap-2 shrink-0"
          >
            <span className="text-lg leading-none">+</span> Go Live
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`text-sm font-semibold px-4 py-1.5 rounded-full border transition-all ${
                activeCategory === cat
                  ? 'bg-amber-500 border-amber-500 text-black'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading && (
        <div className="w-full aspect-video md:aspect-[21/9] bg-zinc-900 rounded-3xl border border-zinc-800 animate-pulse" />
      )}

      {!loading && enriched.length === 0 && <EmptyState onGoLive={openGoLive} />}

      {!loading && featured && (
        <FeaturedBroadcast stream={featured} currentUser={currentUser} router={router} />
      )}

      {!loading && rest.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-zinc-200">More live now</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {rest.map((s) => (
              <StreamCard key={s.id} stream={s} onClick={() => router.push(`/live/${s.id}`)} />
            ))}
          </div>
        </section>
      )}

      {showGoLive && (
        <GoLiveModal onClose={() => setShowGoLive(false)} onStarted={handleStarted} />
      )}
    </main>
  );
}

function FeaturedBroadcast({ stream, currentUser, router }) {
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const isSelf = currentUser && stream.hostId === currentUser.id;

  async function toggleFollow(e) {
    e.stopPropagation();
    if (typeof window === 'undefined' || !window.localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    setFollowBusy(true);
    try {
      if (following) {
        await api.unfollowUser(stream.hostId);
        setFollowing(false);
      } else {
        await api.followUser(stream.hostId);
        setFollowing(true);
      }
    } catch {
      // ignore — non-critical UI action
    } finally {
      setFollowBusy(false);
    }
  }

  return (
    <div
      onClick={() => router.push(`/live/${stream.id}`)}
      className="w-full aspect-video md:aspect-[21/9] bg-zinc-900/95 backdrop-blur-xl rounded-3xl overflow-hidden relative border border-zinc-800 shadow-2xl group cursor-pointer"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
        {stream.host?.avatarUrl ? (
          <img
            src={stream.host.avatarUrl}
            alt=""
            className="w-full h-full object-cover opacity-40 group-hover:opacity-50 transition-opacity"
          />
        ) : (
          <span className="text-zinc-700 text-sm font-mono">Live preview</span>
        )}
      </div>

      {/* Overlays */}
      <div className="absolute top-4 left-4 flex items-center gap-2">
        <span className="bg-red-600/90 text-white text-xs font-bold px-3 py-1 rounded-full backdrop-blur-md flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
        </span>
      </div>
      <div className="absolute top-4 right-4">
        <span className="bg-zinc-900/80 text-zinc-200 text-xs font-semibold px-3 py-1 rounded-full backdrop-blur-md">
          👁️ {formatViewers(stream.viewers)} Viewers
        </span>
      </div>

      {/* Bottom Creator Bar */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-5 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-zinc-700 overflow-hidden shrink-0 border-2 border-amber-500">
              {stream.host?.avatarUrl ? (
                <img src={stream.host.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-bold">
                  {stream.host?.username?.[0]?.toUpperCase() || '?'}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-white truncate">{stream.title}</p>
              <p className="text-zinc-300 text-xs truncate">@{stream.host?.username}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isSelf && (
              <button
                onClick={toggleFollow}
                disabled={followBusy}
                className="hidden sm:inline-flex bg-zinc-800/90 hover:bg-zinc-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all disabled:opacity-50"
              >
                {following ? 'Following' : 'Follow'}
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/live/${stream.id}`);
              }}
              className="bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold px-4 py-2 rounded-xl transition-all"
            >
              Join Stream
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StreamCard({ stream, onClick }) {
  return (
    <div
      onClick={onClick}
      className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 hover:border-amber-500/50 rounded-2xl overflow-hidden transition-all group cursor-pointer shadow-xl"
    >
      <div className="aspect-video bg-zinc-800 relative overflow-hidden">
        {stream.host?.avatarUrl ? (
          <img
            src={stream.host.avatarUrl}
            alt=""
            className="w-full h-full object-cover opacity-50 group-hover:opacity-70 group-hover:scale-105 transition-all duration-300"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900" />
        )}

        <span className="absolute top-2 left-2 bg-red-600/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-full backdrop-blur-md flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
        </span>
        <span className="absolute top-2 right-2 bg-zinc-900/80 text-zinc-200 text-[10px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-md">
          👁️ {formatViewers(stream.viewers)}
        </span>
      </div>

      <div className="p-3 flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-full bg-zinc-700 overflow-hidden shrink-0">
          {stream.host?.avatarUrl ? (
            <img src={stream.host.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs font-bold">
              {stream.host?.username?.[0]?.toUpperCase() || '?'}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-white truncate">{stream.title}</p>
          <p className="text-zinc-400 text-xs truncate">@{stream.host?.username}</p>
          <span className="inline-block mt-1.5 bg-zinc-800 text-zinc-400 text-[10px] px-2 py-0.5 rounded-md">
            {stream.category || 'General'}
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onGoLive }) {
  return (
    <div className="w-full py-20 px-6 rounded-3xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-xl flex flex-col items-center justify-center text-center gap-4">
      <div className="w-16 h-16 rounded-full bg-zinc-800/80 flex items-center justify-center text-2xl">
        📡
      </div>
      <div>
        <p className="font-bold text-lg text-white">No live broadcasts currently active</p>
        <p className="text-zinc-400 text-sm mt-1">Be the first to go live!</p>
      </div>
      <button
        onClick={onGoLive}
        className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-2.5 rounded-xl transition-all shadow-lg flex items-center gap-2"
      >
        <span className="text-lg leading-none">+</span> Start Broadcasting
      </button>
    </div>
  );
}

function GoLiveModal({ onClose, onStarted }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[1]);
  const [tags, setTags] = useState('');
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const [camError, setCamError] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    builtInDeviceId,
    permissionError,
    ready,
    buildConstraints,
  } = useCameraDevices();

  useEffect(() => {
    if (!ready) return; // wait for device enumeration so we open the right camera the first time
    let cancelled = false;
    async function start() {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        const stream = await navigator.mediaDevices.getUserMedia(buildConstraints({ audio: true }));
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        setCamError('Camera access was denied or unavailable. You can still go live without a preview.');
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedDeviceId]);

  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = cameraOn));
  }, [cameraOn]);

  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = micOn));
  }, [micOn]);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const stream = await api.startLiveStream(title.trim() || 'Untitled live stream', {
        category,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onStarted(stream);
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:justify-end bg-black/70 backdrop-blur-sm">
      <div className="w-full md:w-[440px] md:h-full bg-zinc-950 md:border-l border-zinc-800 rounded-t-3xl md:rounded-none p-6 space-y-5 max-h-[92vh] md:max-h-none overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold">Go Live</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl leading-none">
            ✕
          </button>
        </div>

        {/* Camera / mic preview */}
        <div className="aspect-video bg-zinc-900 rounded-2xl overflow-hidden relative border border-zinc-800">
          {camError ? (
            <div className="w-full h-full flex items-center justify-center px-6 text-center">
              <p className="text-zinc-500 text-xs">{camError}</p>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-cover scale-x-[-1] ${cameraOn ? '' : 'hidden'}`}
            />
          )}
          {!cameraOn && !camError && (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-zinc-600 text-sm">Camera off</span>
            </div>
          )}

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3">
            <button
              onClick={() => setCameraOn((v) => !v)}
              className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-all ${
                cameraOn ? 'bg-zinc-800/80 text-white' : 'bg-red-600/90 text-white'
              }`}
              aria-label="Toggle camera"
            >
              🎥
            </button>
            <button
              onClick={() => setMicOn((v) => !v)}
              className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-all ${
                micOn ? 'bg-zinc-800/80 text-white' : 'bg-red-600/90 text-white'
              }`}
              aria-label="Toggle microphone"
            >
              🎙️
            </button>
          </div>

          {devices.length > 1 && (
            <div className="absolute top-3 right-3">
              <CameraDeviceSelect
                devices={devices}
                selectedDeviceId={selectedDeviceId}
                onChange={setSelectedDeviceId}
                builtInDeviceId={builtInDeviceId}
                className="bg-zinc-950/80 backdrop-blur-md border border-zinc-700 text-white text-[11px] rounded-lg px-2 py-1.5 outline-none focus:border-amber-500 max-w-[180px]"
              />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
              Stream Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What are you streaming?"
              className="mt-1.5 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1.5 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
            >
              {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
              Tags / Topics
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. speedrun, chill, q&a"
              className="mt-1.5 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={handleStart}
          disabled={starting}
          className="bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-3 rounded-xl w-full transition-all disabled:opacity-50"
        >
          {starting ? 'Starting…' : 'Start Streaming Now'}
        </button>
      </div>
    </div>
  );
}
