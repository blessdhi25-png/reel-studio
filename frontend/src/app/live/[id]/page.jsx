'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useCameraDevices } from '@/lib/useCameraDevices';
import CameraDeviceSelect from '@/components/CameraDeviceSelect';
import { LoadingSpinner } from '@/components/LoadingScreen';
import TipModal from '@/components/TipModal';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const QUICK_REACTIONS = ['❤️', '🔥', '👏', '🚀', '😂'];

function formatViewers(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return `${n}`;
}

export default function LiveRoomPage({ params }) {
  const { id: streamId } = params;
  const router = useRouter();

  const [stream, setStream] = useState(null);
  // Lifecycle: IDLE -> CONNECTING -> LIVE | ERROR. Camera acquisition and the socket room join
  // run concurrently; the phase is derived from both results (see evaluatePhase).
  const [phase, setPhase] = useState('IDLE');
  const [localStream, setLocalStream] = useState(null);
  const [cameraIssue, setCameraIssue] = useState(null); // null | denied | busy | missing | unsupported | play
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const [peers, setPeers] = useState({}); // socketId -> { username, mediaStream }
  const [myId, setMyId] = useState(null);
  const [error, setError] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [ending, setEnding] = useState(false);
  const [pinned, setPinned] = useState(null);
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [showTip, setShowTip] = useState(false);
  const [screenStream, setScreenStream] = useState(null); // active screen share (also our outgoing video)
  const [canDisplayShare, setCanDisplayShare] = useState(false);
  const [streamEnded, setStreamEnded] = useState(false); // host ended the stream while we were in the room
  const [previewNonce, setPreviewNonce] = useState(0); // bump to retry a blocked local preview .play()

  const screenTrackRef = useRef(null);
  const screenStreamRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({}); // socketId -> RTCPeerConnection
  const chatScrollRef = useRef(null);
  const attemptRef = useRef(0); // bumps on every (re)connect and on unmount; stale async results check it
  const timeoutRef = useRef(null);
  const statusRef = useRef({ cam: 'pending', join: 'pending' });
  const cameraPromiseRef = useRef(Promise.resolve());
  const joined = phase !== 'IDLE';
  const { devices, selectedDeviceId, setSelectedDeviceId, builtInDeviceId, buildConstraints } =
    useCameraDevices();

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    const storedUser = JSON.parse(localStorage.getItem('user') || 'null');
    if (storedUser) setMyId(storedUser.id);

    api
      .getLiveStream(streamId)
      .then((s) => {
        setStream(s);
        setIsHost(storedUser && s.hostId === storedUser.id);
        setViewerCount(Math.max(s.peakViewers || 0, 1));
      })
      .catch((err) => setError(err.message));

    return () => cleanupAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId, router]);

  useEffect(() => {
    // Auto-scroll only the chat panel, not the whole page.
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages]);

  useEffect(() => {
    setCanDisplayShare(typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia);
  }, []);

  function createPeerConnection(socketId, socket) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Outgoing media: our mic, plus either the screen share (if active) or the camera.
    const local = localStreamRef.current;
    const outVideo = screenTrackRef.current || local?.getVideoTracks()[0] || null;
    const carrier = local || (screenStreamRef.current ?? null);
    local?.getAudioTracks().forEach((track) => pc.addTrack(track, local));
    if (outVideo) pc.addTrack(outVideo, carrier || new MediaStream([outVideo]));

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('live:signal', { to: socketId, signal: { candidate: e.candidate } });
      }
    };

    pc.ontrack = (e) => {
      setPeers((prev) => ({
        ...prev,
        [socketId]: { ...(prev[socketId] || {}), mediaStream: e.streams[0] },
      }));
    };

    peerConnectionsRef.current[socketId] = pc;
    return pc;
  }

  function classifyMediaError(err) {
    const name = err?.name || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied';
    if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'missing';
    return 'denied';
  }

  // Never rejects: resolves { media } or { issue }.
  async function acquireCamera() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return { issue: 'unsupported' };
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia(buildConstraints({ audio: true }));
      return { media };
    } catch (err) {
      return { issue: classifyMediaError(err) };
    }
  }

  // Moves to LIVE only once BOTH the socket join is acked and the camera attempt has settled
  // (stream or a handled failure), whichever order they resolve in. Viewers without a camera
  // still go LIVE and get the banner.
  function evaluatePhase(attempt) {
    if (attempt !== attemptRef.current) return;
    const { cam, join } = statusRef.current;
    if (join === 'acked' && cam !== 'pending') {
      clearTimeout(timeoutRef.current);
      setError(null);
      setPhase('LIVE');
    }
  }

  function detachListeners() {
    const socket = getSocket();
    ['live:existing-peers', 'live:peer-joined', 'live:signal', 'live:peer-left', 'live:viewer-count',
      'live:chat-message', 'live:pin-message', 'live:reaction', 'live:tip', 'live:stream-ended'].forEach((ev) => socket?.off(ev));
  }

  function attachListeners(socket) {
    detachListeners();

    socket.on('live:existing-peers', async (existingPeers) => {
      await cameraPromiseRef.current; // offers must include our tracks
      for (const { socketId, username, userId } of existingPeers) {
        setPeers((prev) => ({ ...prev, [socketId]: { username, userId } }));
        const pc = createPeerConnection(socketId, socket);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('live:signal', { to: socketId, signal: offer });
      }
    });

    socket.on('live:peer-joined', ({ socketId, username, userId }) => {
      setPeers((prev) => ({ ...prev, [socketId]: { username, userId } }));
    });

    socket.on('live:signal', async ({ from, signal }) => {
      await cameraPromiseRef.current;
      let pc = peerConnectionsRef.current[from];
      if (!pc) pc = createPeerConnection(from, socket);

      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('live:signal', { to: from, signal: answer });
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.candidate) {
        try {
          await pc.addIceCandidate(signal.candidate);
        } catch {
          // ICE candidates can arrive before remote description is set; safe to ignore.
        }
      }
    });

    socket.on('live:peer-left', ({ socketId }) => {
      peerConnectionsRef.current[socketId]?.close();
      delete peerConnectionsRef.current[socketId];
      setPeers((prev) => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
    });

    socket.on('live:viewer-count', ({ count }) => setViewerCount(count));
    socket.on('live:chat-message', (msg) => setChatMessages((prev) => [...prev.slice(-199), msg]));
    socket.on('live:pin-message', (msg) => setPinned(msg));
    socket.on('live:reaction', (r) => {
      const flightId = `${r.at}-${Math.random()}`;
      const dur = 2.4 + Math.random() * 1.4;
      // Drift up from the right-hand side with a random horizontal sway, then fade out.
      setFloatingReactions((prev) => [
        ...prev.slice(-40),
        { ...r, flightId, x: 55 + Math.random() * 33, sway: (Math.random() * 2 - 1) * 60, dur, scale: 0.9 + Math.random() * 0.5 },
      ]);
      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((f) => f.flightId !== flightId));
      }, dur * 1000 + 100);
    });

    // Host ended the stream: tear everything down immediately and show the end screen.
    socket.on('live:stream-ended', () => {
      if (isHost) return; // the host's own End button handles its navigation
      attemptRef.current += 1;
      clearTimeout(timeoutRef.current);
      releaseLocalMedia();
      setPeers({});
      setCameraIssue(null);
      setError(null);
      setPhase('IDLE');
      setStream((s) => (s ? { ...s, status: 'ended' } : s));
      setStreamEnded(true);
      detachListeners();
    });
    socket.on('live:tip', (tip) => {
      setChatMessages((prev) => [
        ...prev.slice(-199),
        {
          system: true,
          content: `sent a $${((tip.amountCents || 0) / 100).toFixed(2)} gift${
            tip.message ? ` — "${tip.message}"` : ''
          } 🎁`,
          username: tip.username || 'Someone',
          at: tip.at,
        },
      ]);
    });
  }

  // Resolves when the server acks live:join. Older backends don't ack but always answer with
  // live:existing-peers, so that event counts as the ack too.
  function joinRoom(socket) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        socket.off('live:existing-peers', finish);
        resolve();
      };
      socket.on('live:existing-peers', finish);
      socket.emit('live:join', streamId, finish);
    });
  }

  async function startSession() {
    const attempt = ++attemptRef.current;
    clearTimeout(timeoutRef.current);
    setError(null);
    setCameraIssue(null);
    setPhase('CONNECTING');

    const socket = getSocket();
    if (!socket) {
      setError('Not authenticated.');
      setPhase('ERROR');
      return;
    }

    // Reconnect: drop stale peers/listeners, and leave so the re-join is clean.
    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
    peerConnectionsRef.current = {};
    setPeers({});
    socket.emit('live:leave');

    statusRef.current = {
      cam: localStreamRef.current?.getTracks().some((t) => t.readyState === 'live') ? 'ready' : 'pending',
      join: 'pending',
    };

    // 8s budget for the signaling handshake. (Camera permission prompts are user-paced, so the
    // camera is deliberately not part of this budget.)
    timeoutRef.current = setTimeout(() => {
      if (attempt !== attemptRef.current || statusRef.current.join === 'acked') return;
      setError('Connection timed out. Tap to reconnect');
      setPhase('ERROR');
    }, 8000);

    attachListeners(socket);

    const camera =
      statusRef.current.cam === 'ready'
        ? Promise.resolve({ media: localStreamRef.current })
        : acquireCamera();

    cameraPromiseRef.current = camera.then((res) => {
      if (attempt !== attemptRef.current) {
        // Superseded or unmounted while the prompt was open: don't leak the device.
        if (res.media && res.media !== localStreamRef.current) res.media.getTracks().forEach((t) => t.stop());
        return;
      }
      if (res.media) {
        localStreamRef.current = res.media;
        setLocalStream(res.media);
        setCameraOn(res.media.getVideoTracks()[0]?.enabled !== false);
        statusRef.current.cam = 'ready';
      } else {
        setCameraIssue(res.issue);
        statusRef.current.cam = 'failed';
      }
      evaluatePhase(attempt);
    });

    joinRoom(socket).then(() => {
      if (attempt !== attemptRef.current) return;
      statusRef.current.join = 'acked';
      evaluatePhase(attempt);
    });
  }

  // "Tap to enable camera": re-ask for the device, then add the new tracks to any open peer
  // connections and renegotiate so existing peers start receiving video.
  async function retryCamera() {
    setCameraIssue(null);
    const res = await acquireCamera();
    if (!res.media) {
      setCameraIssue(res.issue);
      return;
    }
    localStreamRef.current = res.media;
    setLocalStream(res.media);
    setCameraOn(true);
    setMicOn(true);
    const socket = getSocket();
    for (const [socketId, pc] of Object.entries(peerConnectionsRef.current)) {
      res.media.getTracks().forEach((track) => pc.addTrack(track, res.media));
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit('live:signal', { to: socketId, signal: offer });
      } catch {
        // peer will pick the tracks up on its next negotiation
      }
    }
  }

  function resumePreview() {
    setCameraIssue(null);
    setPreviewNonce((n) => n + 1);
  }

  function cleanupAll() {
    attemptRef.current += 1; // invalidates any in-flight start/retry
    clearTimeout(timeoutRef.current);
    releaseLocalMedia();
    const socket = getSocket();
    socket?.emit('live:leave');
    detachListeners();
  }

  // Close every peer connection and release camera, mic and any screen share.
  function releaseLocalMedia() {
    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
    peerConnectionsRef.current = {};
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    const shareTrack = screenTrackRef.current;
    if (shareTrack) {
      shareTrack.onended = null;
      shareTrack.stop();
    }
    screenTrackRef.current = null;
    screenStreamRef.current = null;
    setScreenStream(null);
  }

  // Point every peer connection at a new outgoing video track (screen <-> camera), renegotiating
  // only when a connection had no video sender yet.
  async function swapOutgoingVideo(newTrack) {
    const socket = getSocket();
    const carrier = screenStreamRef.current || localStreamRef.current;
    for (const [socketId, pc] of Object.entries(peerConnectionsRef.current)) {
      try {
        const tx = pc.getTransceivers().find((t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video');
        let needsOffer = false;
        if (tx) {
          await tx.sender.replaceTrack(newTrack);
          if (newTrack && (tx.direction === 'recvonly' || tx.direction === 'inactive')) {
            tx.direction = 'sendrecv';
            needsOffer = true;
          }
        } else if (newTrack) {
          pc.addTrack(newTrack, carrier || new MediaStream([newTrack]));
          needsOffer = true;
        }
        if (needsOffer) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket?.emit('live:signal', { to: socketId, signal: offer });
        }
      } catch {
        // that peer keeps its previous video; the rest still switch
      }
    }
  }

  async function stopScreenShare() {
    const track = screenTrackRef.current;
    if (!track) return;
    track.onended = null;
    track.stop();
    screenTrackRef.current = null;
    screenStreamRef.current = null;
    setScreenStream(null);
    await swapOutgoingVideo(localStreamRef.current?.getVideoTracks()[0] || null);
  }

  async function startScreenShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Screen sharing isn't supported on this device.");
      return;
    }
    let display;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch (err) {
      // Closing the picker is a normal "no", not an error worth shouting about.
      if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') setError('Could not start screen sharing.');
      return;
    }
    const track = display.getVideoTracks()[0];
    if (!track) return;
    screenTrackRef.current = track;
    screenStreamRef.current = display;
    setScreenStream(display);
    track.onended = () => stopScreenShare(); // browser's own "Stop sharing" bar
    await swapOutgoingVideo(track);
  }

  function toggleCamera() {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCameraOn(track.enabled);
    }
  }

  function toggleMic() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
  }

  function sendChat(e) {
    e.preventDefault();
    if (!chatText.trim()) return;
    getSocket()?.emit('live:chat-message', { streamId, content: chatText.trim() });
    setChatText('');
  }

  function sendReaction(emoji) {
    getSocket()?.emit('live:reaction', { streamId, emoji });
  }

  function pinMessage(msg) {
    getSocket()?.emit('live:pin-message', { streamId, message: { username: msg.username, content: msg.content } });
  }

  function unpin() {
    getSocket()?.emit('live:pin-message', { streamId, message: null });
  }

  async function handleEndStream() {
    setEnding(true);
    try {
      await api.endLiveStream(streamId);
      cleanupAll();
      router.push('/live');
    } catch (err) {
      setError(err.message);
      setEnding(false);
    }
  }

  if (!stream) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950">
        {error ? (
          <p className="text-sm text-zinc-400">{error}</p>
        ) : (
          <LoadingSpinner label="Loading…" />
        )}
      </main>
    );
  }

  const peerList = Object.entries(peers);
  const hasEnded = stream.status === 'ended';

  // ----- Stage layout -----
  // Viewer: the HOST's video fills the screen; everyone else (incl. our own camera) floats as small tiles.
  // Host: our preview plus every connected participant tile into a responsive grid.
  const remoteWithMedia = peerList.filter(([, p]) => p.mediaStream);
  const hostEntry = peerList.find(([, p]) => p.userId === stream.hostId);
  const hostPeer = hostEntry && hostEntry[1].mediaStream ? hostEntry : null;
  const localPreview = screenStream || localStream;
  const localShowsAvatar = !localPreview || (!screenStream && !cameraOn);
  const localTile = {
    id: 'local',
    stream: localPreview,
    label: isHost ? 'You' : '@you',
    muted: true,
    mirror: !screenStream,
    forceAvatar: localShowsAvatar,
    avatarUrl: isHost ? stream.host?.avatarUrl : null,
    initial: isHost ? stream.host?.username?.[0] : 'Y',
    isLocal: true,
  };
  const remoteTile = ([socketId, p]) => ({
    id: socketId,
    stream: p.mediaStream,
    label: `@${p.username || '…'}`,
    muted: false,
    avatarUrl: p.userId === stream.hostId ? stream.host?.avatarUrl : null,
    initial: p.username?.[0],
  });
  const hostGridTiles = [localTile, ...remoteWithMedia.map(remoteTile)];
  const sideTiles = [
    ...(localStream || screenStream ? [localTile] : []),
    ...remoteWithMedia.filter(([id]) => id !== hostPeer?.[0]).map(remoteTile),
  ];

  return (
    <main className="relative min-h-screen h-screen w-full overflow-hidden bg-zinc-950 text-white flex flex-col">
      {/* ---------- Video stage ---------- */}
      <div className="absolute inset-0 z-0 bg-zinc-950">
        {joined && isHost ? (
          <div className={`grid w-full h-full gap-0.5 auto-rows-fr ${gridColsClass(hostGridTiles.length)}`}>
            {hostGridTiles.map((t, i) => (
              <StreamTile
                key={t.id}
                {...t}
                retryKey={previewNonce}
                onPlayBlocked={t.isLocal ? () => setCameraIssue((c) => c || 'play') : undefined}
                className={`w-full h-full ${hostGridTiles.length === 3 && i === 2 ? 'col-span-2' : ''}`}
              />
            ))}
          </div>
        ) : joined && hostPeer ? (
          <StreamTile {...remoteTile(hostPeer)} avatarUrl={stream.host?.avatarUrl} className="w-full h-full" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-zinc-900 to-zinc-950 flex flex-col items-center justify-center gap-3">
            {stream.host?.avatarUrl && (
              <img src={stream.host.avatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
            )}
            {joined && !hasEnded && (
              <p className="relative text-sm font-semibold text-zinc-300">Waiting for the host&apos;s video…</p>
            )}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70 pointer-events-none" />
      </div>

      {/* ---------- Floating picture-in-picture tiles ---------- */}
      {/* Viewer: own camera + any other participants. Host: nothing here, everyone is in the grid. */}
      {joined && !isHost && sideTiles.length > 0 && (
        <div className="absolute top-20 right-3 z-20 flex flex-col gap-2 max-h-[55vh] overflow-y-auto no-scrollbar">
          {sideTiles.map((t) => (
            <StreamTile
              key={t.id}
              {...t}
              retryKey={previewNonce}
              onPlayBlocked={t.isLocal ? () => setCameraIssue((c) => c || 'play') : undefined}
              className="w-24 sm:w-32 aspect-[3/4] rounded-xl overflow-hidden border border-zinc-700 shadow-xl"
              compact
            />
          ))}
        </div>
      )}

      {/* ---------- Floating emoji reactions ---------- */}
      <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
        {floatingReactions.map((r) => (
          <span
            key={r.flightId}
            className="live-reaction absolute bottom-28 leading-none select-none"
            style={{
              left: `${r.x}%`,
              fontSize: `${(1.9 * r.scale).toFixed(2)}rem`,
              '--sway': `${r.sway.toFixed(0)}px`,
              animation: `reaction-float ${r.dur.toFixed(2)}s ease-out forwards`,
            }}
          >
            {r.emoji}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes reaction-float {
          0%   { transform: translate(0, 0) scale(0.5); opacity: 0; }
          12%  { transform: translate(calc(var(--sway) * 0.2), -30px) scale(1.1); opacity: 1; }
          55%  { transform: translate(var(--sway), -170px) scale(1); opacity: 1; }
          100% { transform: translate(calc(var(--sway) * -0.7), -340px) scale(1.15); opacity: 0; }
        }
        @keyframes reaction-fade {
          0% { opacity: 0; } 20% { opacity: 1; } 100% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .live-reaction { animation-name: reaction-fade !important; }
        }
      `}</style>

      {/* ---------- Top bar ---------- */}
      <div className="relative z-20 flex items-start justify-between gap-3 px-4 pt-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => router.push('/live')}
            className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 text-white text-sm font-semibold px-3 py-1.5 rounded-full hover:bg-zinc-800/90 transition-all"
          >
            ← Live
          </button>
          <span className="bg-red-600/90 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE 🔴
          </span>
          <span className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 text-zinc-200 text-xs font-semibold px-3 py-1.5 rounded-full">
            👁️ {formatViewers(viewerCount)}
          </span>
        </div>

        {isHost && !hasEnded && (
          <button
            onClick={handleEndStream}
            disabled={ending}
            className="bg-red-600/90 hover:bg-red-500 backdrop-blur-md text-white text-xs font-bold px-4 py-2 rounded-full transition-all disabled:opacity-50 shrink-0"
          >
            {ending ? 'Ending…' : 'End stream'}
          </button>
        )}
      </div>

      <div className="relative z-20 px-4 mt-2">
        <div className="bg-zinc-900/70 backdrop-blur-md border border-zinc-800 rounded-2xl px-4 py-2.5 inline-block max-w-full">
          <p className="font-extrabold text-white truncate">{stream.title}</p>
          <p className="text-zinc-400 text-xs truncate">
            @{stream.host?.username}
            {stream.category && <span className="text-zinc-600"> · {stream.category}</span>}
          </p>
        </div>
      </div>

      {/* ---------- Pinned message banner ---------- */}
      {pinned && (
        <div className="relative z-20 px-4 mt-3">
          <div className="bg-amber-500/10 backdrop-blur-md border border-amber-500/40 rounded-2xl px-4 py-2.5 flex items-start gap-2 max-w-lg">
            <span className="text-amber-400 text-sm shrink-0">📌</span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wide">
                Pinned{isHost ? '' : ` · @${pinned.username}`}
              </p>
              <p className="text-sm text-white truncate">{pinned.content}</p>
            </div>
            {isHost && (
              <button onClick={unpin} className="text-amber-400/70 hover:text-amber-300 text-xs shrink-0">
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {hasEnded && (
        <div className="relative z-20 px-4 mt-3">
          <p className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 text-zinc-300 text-sm text-center py-2.5 rounded-xl">
            This stream has ended.
          </p>
        </div>
      )}

      <div className="flex-1" />

      {error && phase !== 'ERROR' && (
        <div className="relative z-20 px-4 mb-2">
          <p className="text-sm text-red-400 bg-zinc-900/80 backdrop-blur-md border border-red-500/30 rounded-xl px-4 py-2 max-w-sm">
            {error}
          </p>
        </div>
      )}

      {/* ---------- Join CTA ---------- */}
      {!joined && !hasEnded && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-20 px-4 flex flex-col items-center gap-3">
          {devices.length > 1 && (
            <CameraDeviceSelect
              devices={devices}
              selectedDeviceId={selectedDeviceId}
              onChange={setSelectedDeviceId}
              builtInDeviceId={builtInDeviceId}
              className="bg-zinc-900/90 backdrop-blur-md border border-zinc-800 text-white text-xs rounded-xl px-3 py-2 outline-none"
            />
          )}
          <button
            onClick={startSession}
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3.5 rounded-2xl transition-all shadow-2xl"
          >
            Join with camera
          </button>
        </div>
      )}

      {/* ---------- Connection state ---------- */}
      {phase === 'CONNECTING' && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 px-4 flex justify-center pointer-events-none">
          <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-2xl px-5 py-3 flex items-center gap-3">
            <span className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
            <span className="text-sm font-semibold text-zinc-200">
              {statusRef.current.join === 'acked' ? 'Waiting for camera permission…' : 'Connecting…'}
            </span>
          </div>
        </div>
      )}
      {phase === 'ERROR' && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 px-4 flex justify-center">
          <button
            onClick={startSession}
            className="bg-red-600 hover:bg-red-500 text-white font-bold text-sm px-6 py-3.5 rounded-2xl shadow-2xl transition-all"
          >
            {error || 'Connection failed. Tap to reconnect'}
          </button>
        </div>
      )}
      {joined && cameraIssue && (
        <div className="absolute inset-x-0 top-28 z-30 px-4 flex justify-center">
          <button
            onClick={cameraIssue === 'play' ? resumePreview : retryCamera}
            className="max-w-sm bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm px-5 py-3 rounded-2xl shadow-2xl transition-all text-center"
          >
            {cameraIssue === 'busy'
              ? 'Camera is in use by another app. Close it, then tap to retry.'
              : cameraIssue === 'missing'
              ? 'No camera found. Connect one, then tap to retry.'
              : cameraIssue === 'unsupported'
              ? 'This browser does not support camera access.'
              : cameraIssue === 'play'
              ? 'Tap to start the camera preview'
              : 'Camera access required. Please tap to enable camera'}
          </button>
        </div>
      )}

      {/* ---------- Bottom bar ---------- */}
      {/* Pinned above the BottomNav (fixed bottom-0 z-50) so the chat card,
          input and floating action buttons never sit beneath the tabs.
          calc() = bottom-24 plus the device's home-indicator inset, matching
          how far the nav itself grows. */}
      <div className="fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 flex items-end justify-between gap-3">
        <div className="w-full max-w-sm flex flex-col gap-2">
        {joined && !hasEnded && (
          <div className="flex items-center gap-1.5" role="group" aria-label="Send a reaction">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => sendReaction(emoji)}
                aria-label={`React ${emoji}`}
                className="w-11 h-11 rounded-full bg-zinc-900/80 backdrop-blur-md border border-zinc-800 hover:bg-zinc-800 flex items-center justify-center text-xl transition active:scale-90"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <div className="w-full bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
          <div ref={chatScrollRef} className="max-h-52 overflow-y-auto px-3.5 pt-3 pb-2 space-y-1.5">
            {chatMessages.length === 0 && (
              <p className="text-xs text-zinc-600 text-center py-4">Chat will appear here…</p>
            )}
            {chatMessages.map((m, i) =>
              m.system ? (
                <p key={i} className="text-xs text-amber-400/90 italic">
                  🎁 <span className="font-semibold">{m.username}</span> {m.content}
                </p>
              ) : (
                <ChatLine
                  key={i}
                  message={m}
                  isHostMsg={m.userId === stream.hostId}
                  canPin={isHost && !hasEnded}
                  onPin={() => pinMessage(m)}
                />
              )
            )}
          </div>
          {!hasEnded && (
            <form onSubmit={sendChat} className="flex items-center gap-2 p-2.5 border-t border-zinc-800">
              <input
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="Say something…"
                className="flex-1 min-w-0 bg-zinc-800/80 text-white text-sm rounded-full px-4 py-2 outline-none border border-transparent focus:border-amber-500/60"
              />
              <button
                type="submit"
                className="w-9 h-9 shrink-0 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-bold flex items-center justify-center transition-colors"
                aria-label="Send"
              >
                ➤
              </button>
            </form>
          )}
        </div>
        </div>

        {/* Right action controls */}
        <div className="flex flex-col items-center gap-3 shrink-0 pb-1">
          {!isHost && !hasEnded && (
            <button
              onClick={() => setShowTip(true)}
              className="w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-400 text-black flex flex-col items-center justify-center font-bold shadow-2xl transition-all hover:scale-105"
              aria-label="Tip / Send Gift"
            >
              <span className="text-xl leading-none">$</span>
            </button>
          )}
          {joined && (
            <>
              <button
                onClick={toggleMic}
                className={`w-11 h-11 rounded-full backdrop-blur-md flex items-center justify-center transition-all ${
                  micOn ? 'bg-zinc-900/80 border border-zinc-800 text-white' : 'bg-red-600/90 text-white'
                }`}
                aria-label="Toggle microphone"
              >
                🎙️
              </button>
              <button
                onClick={toggleCamera}
                className={`w-11 h-11 rounded-full backdrop-blur-md flex items-center justify-center transition-all ${
                  cameraOn ? 'bg-zinc-900/80 border border-zinc-800 text-white' : 'bg-red-600/90 text-white'
                }`}
                aria-label="Toggle camera"
              >
                🎥
              </button>
              {canDisplayShare && (isHost || localStream) && (
                <button
                  onClick={screenStream ? stopScreenShare : startScreenShare}
                  className={`w-11 h-11 rounded-full backdrop-blur-md flex items-center justify-center transition-all ${
                    screenStream ? 'bg-amber-500 text-black' : 'bg-zinc-900/80 border border-zinc-800 text-white'
                  }`}
                  aria-label={screenStream ? 'Stop sharing screen' : 'Share screen'}
                  aria-pressed={!!screenStream}
                  title={screenStream ? 'Stop sharing screen' : 'Share screen'}
                >
                  🖥️
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {streamEnded && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-6 bg-black/75 backdrop-blur-md" role="alertdialog" aria-modal="true" aria-labelledby="stream-ended-title">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 shadow-2xl p-6 text-center">
            <span className="mx-auto mb-4 w-14 h-14 rounded-full bg-red-500/15 border border-red-500/40 flex items-center justify-center text-2xl">📴</span>
            <h2 id="stream-ended-title" className="font-extrabold text-xl tracking-tight">Stream has ended by host</h2>
            <p className="mt-2 text-sm font-medium text-zinc-400">
              @{stream.host?.username} has stopped broadcasting. Thanks for watching!
            </p>
            <button
              onClick={() => router.push('/')}
              className="mt-6 w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm transition active:scale-[0.98]"
            >
              Back to feed
            </button>
          </div>
        </div>
      )}

      {showTip && (
        <TipModal
          target={{
            type: 'live',
            id: streamId,
            username: stream.host?.username,
            avatarUrl: stream.host?.avatarUrl,
          }}
          onClose={() => setShowTip(false)}
        />
      )}
    </main>
  );
}

function ChatLine({ message, isHostMsg, canPin, onPin }) {
  const [hover, setHover] = useState(false);
  return (
    <p
      className="text-sm text-zinc-100 leading-snug group flex items-start gap-1"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="min-w-0 break-words">
        {isHostMsg ? (
          <span className="inline-flex items-center gap-1 mr-1 bg-amber-500 text-black text-[10px] font-extrabold px-1.5 py-0.5 rounded-md align-middle">
            HOST
          </span>
        ) : null}
        <span className="text-amber-400 font-semibold">@{message.username}</span>{' '}
        <span className="text-zinc-200">{message.content}</span>
      </span>
      {canPin && hover && (
        <button
          onClick={onPin}
          className="ml-auto shrink-0 text-[10px] text-zinc-500 hover:text-amber-400 px-1"
          title="Pin this message"
        >
          📌
        </button>
      )}
    </p>
  );
}

function gridColsClass(n) {
  if (n <= 1) return 'grid-cols-1';
  if (n === 2) return 'grid-cols-1 sm:grid-cols-2'; // stacked on portrait phones, side by side when wide
  if (n <= 4) return 'grid-cols-2';
  return 'grid-cols-3';
}

// One participant: plays the stream (audio included, unless muted) and falls back to an avatar
// when there is no live video track (camera off, audio-only peer, still connecting).
function StreamTile({ stream, label, muted, mirror, forceAvatar, avatarUrl, initial, className = '', compact, retryKey, onPlayBlocked }) {
  const videoRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    if (!stream) {
      setHasVideo(false);
      return undefined;
    }
    const update = () => setHasVideo(stream.getVideoTracks().some((t) => t.readyState === 'live'));
    update();
    stream.addEventListener('addtrack', update);
    stream.addEventListener('removetrack', update);
    return () => {
      stream.removeEventListener('addtrack', update);
      stream.removeEventListener('removetrack', update);
    };
  }, [stream]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;
    let cancelled = false;
    (async () => {
      el.srcObject = stream || null;
      if (!stream) return;
      try {
        await el.play();
      } catch (err) {
        if (!cancelled && err?.name !== 'AbortError') onPlayBlocked?.();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, retryKey]);

  const showAvatar = forceAvatar || !hasVideo;
  return (
    <div className={`relative bg-zinc-900 overflow-hidden ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={!!muted}
        className={`absolute inset-0 z-0 w-full h-full object-cover ${mirror ? 'scale-x-[-1]' : ''} ${showAvatar ? 'invisible' : ''}`}
      />
      {showAvatar && (
        <div className="absolute inset-0 z-0 flex items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950">
          <div className={`${compact ? 'w-12 h-12 text-lg' : 'w-24 h-24 text-2xl'} rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center font-bold text-zinc-500`}>
            {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : (initial || '?').toUpperCase()}
          </div>
        </div>
      )}
      {label && (
        <span className="absolute bottom-1.5 left-1.5 z-10 text-[10px] font-semibold text-white bg-black/70 px-1.5 py-0.5 rounded-md">
          {label}
        </span>
      )}
    </div>
  );
}
