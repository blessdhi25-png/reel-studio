'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Mic, MicOff, MonitorUp, PhoneOff, Smile, SwitchCamera, UserPlus, Video, VideoOff, X } from 'lucide-react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useCameraDevices } from '@/lib/useCameraDevices';
import CameraDeviceSelect from '@/components/CameraDeviceSelect';
import { LoadingSpinner } from '@/components/LoadingScreen';
import TipModal from '@/components/TipModal';
import InviteSheet from '@/components/live/InviteSheet';

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
  const [showInvite, setShowInvite] = useState(false);
  const [screenStream, setScreenStream] = useState(null); // active screen share (also our outgoing video)
  const [canDisplayShare, setCanDisplayShare] = useState(false);
  const [streamEnded, setStreamEnded] = useState(false); // host ended the stream while we were in the room
  const [chatOpen, setChatOpen] = useState(false); // bottom-sheet chat drawer
  const [reactionsOpen, setReactionsOpen] = useState(false); // floating emoji tray
  const [unreadChat, setUnreadChat] = useState(0); // messages that arrived while the drawer was closed
  const [sheetDragY, setSheetDragY] = useState(0);
  const [facingMode, setFacingMode] = useState('user'); // 'user' (front, mirrored) | 'environment'
  const [previewNonce, setPreviewNonce] = useState(0); // bump to retry a blocked local preview .play()
  const [netLost, setNetLost] = useState(false); // OUR connection is down -> full-width banner
  const [recovered, setRecovered] = useState(false); // brief "back online" confirmation
  const [peerAlerts, setPeerAlerts] = useState({}); // socketId -> { username, state: 'unstable'|'lost', remote?, local? }

  const screenTrackRef = useRef(null);
  const chatOpenRef = useRef(false); // socket handlers read this (they close over stale state)
  const dragStartRef = useRef(null);
  const screenStreamRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({}); // socketId -> RTCPeerConnection
  const linkRef = useRef({}); // socketId -> 'ok' | 'disconnected' | 'failed' (from ICE/connection state)
  const initiatorRef = useRef({}); // socketId -> true when WE sent the offer (only that side restarts ICE)
  const netLostRef = useRef(false);
  const socketDownRef = useRef(false);
  const peersRef = useRef({});
  const phaseRef = useRef('IDLE');
  const startSessionRef = useRef(null);
  const chatScrollRef = useRef(null);
  const attemptRef = useRef(0); // bumps on every (re)connect and on unmount; stale async results check it
  const timeoutRef = useRef(null);
  const statusRef = useRef({ cam: 'pending', join: 'pending' });
  const cameraPromiseRef = useRef(Promise.resolve());
  const joined = phase !== 'IDLE';
  // Latest-value mirrors for the socket/WebRTC callbacks, which close over stale render state.
  phaseRef.current = phase;
  peersRef.current = peers;
  startSessionRef.current = startSession;
  const { devices, selectedDeviceId, setSelectedDeviceId, builtInDeviceId, buildConstraints } =
    useCameraDevices();

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      // Come back to this room after logging in (an invite link opened while logged out).
      router.push(`/login?from=${encodeURIComponent(`/live/${streamId}`)}`);
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
  }, [chatMessages, chatOpen]);

  useEffect(() => {
    setCanDisplayShare(typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia);
  }, []);

  // Network monitoring: the signalling socket dropping, or the browser going offline (data switched
  // off), flips the "Network connection lost. Reconnecting…" banner. When the socket comes back it
  // has a new id and has lost its room membership, so we re-join through the normal start path.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onDown = () => {
      socketDownRef.current = true;
      reevaluateNetwork();
    };
    const onUp = () => {
      if (!socketDownRef.current) return;
      socketDownRef.current = false;
      reevaluateNetwork();
      if (phaseRef.current === 'LIVE') startSessionRef.current?.();
    };
    const onOffline = () => reevaluateNetwork();
    const onOnline = () => {
      reevaluateNetwork();
      Object.keys(linkRef.current).forEach((id) => linkRef.current[id] !== 'ok' && restartIce(id));
    };
    socket.on('disconnect', onDown);
    socket.on('connect', onUp);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      socket.off('disconnect', onDown);
      socket.off('connect', onUp);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream?.id]);

  function openChat() {
    chatOpenRef.current = true;
    setChatOpen(true);
    setReactionsOpen(false);
    setUnreadChat(0);
    setSheetDragY(0);
  }

  function closeChat() {
    chatOpenRef.current = false;
    setChatOpen(false);
    setSheetDragY(0);
  }

  useEffect(() => {
    if (!chatOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && closeChat();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chatOpen]);

  // Drag the handle down to dismiss; a plain tap on it also closes.
  function onHandleDown(e) {
    dragStartRef.current = e.clientY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onHandleMove(e) {
    if (dragStartRef.current == null) return;
    setSheetDragY(Math.max(0, e.clientY - dragStartRef.current));
  }
  function onHandleUp(e) {
    if (dragStartRef.current == null) return;
    const dy = e.clientY - dragStartRef.current;
    dragStartRef.current = null;
    if (dy > 70 || Math.abs(dy) < 4) closeChat();
    else setSheetDragY(0);
  }

  // Decide whether the problem is us or a specific peer, and tell everyone else if it's us.
  //  - We are "lost" when the browser is offline, the signalling socket is down, or EVERY one of
  //    several peer links is bad at once (one bad link out of many is that peer's problem).
  //  - Otherwise any bad link is attributed to that peer ("@name connection is unstable or lost").
  function reevaluateNetwork() {
    const links = Object.entries(linkRef.current);
    const bad = links.filter(([, s]) => s !== 'ok');
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const lost = offline || socketDownRef.current || (links.length >= 2 && bad.length === links.length);
    if (lost !== netLostRef.current) {
      netLostRef.current = lost;
      setNetLost(lost);
      if (!lost) {
        setRecovered(true);
        setTimeout(() => setRecovered(false), 2500);
      }
      const socket = getSocket();
      // While the socket is down the server reports the drop itself (on disconnect); this covers
      // the "socket fine, media path dead" case and the recovery ping.
      if (socket?.connected) socket.emit('live:connection-status', { streamId, state: lost ? 'lost' : 'ok' });
    }
    setPeerAlerts((prev) => {
      const next = {};
      Object.entries(prev).forEach(([id, v]) => v.remote && (next[id] = { ...v, local: false }));
      if (!lost) {
        bad.forEach(([id, s]) => {
          next[id] = {
            ...(next[id] || {}),
            username: peersRef.current[id]?.username || next[id]?.username,
            state: s === 'failed' ? 'lost' : 'unstable',
            local: true,
          };
        });
      }
      return next;
    });
  }

  // ICE restart (offerer side only, to avoid glare): re-gathers candidates on the new network path.
  async function restartIce(socketId) {
    const pc = peerConnectionsRef.current[socketId];
    const socket = getSocket();
    if (!pc || !socket?.connected || !initiatorRef.current[socketId] || pc.signalingState !== 'stable') return;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      socket.emit('live:signal', { to: socketId, signal: offer });
    } catch {
      /* the next state change will try again */
    }
  }

  function createPeerConnection(socketId, socket) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    linkRef.current[socketId] = 'ok';

    const onLinkChange = () => {
      const ice = pc.iceConnectionState;
      const conn = pc.connectionState;
      const failed = ice === 'failed' || conn === 'failed';
      const bad = failed || ice === 'disconnected' || conn === 'disconnected';
      linkRef.current[socketId] = failed ? 'failed' : bad ? 'disconnected' : 'ok';
      reevaluateNetwork();
      if (failed) restartIce(socketId);
    };
    pc.oniceconnectionstatechange = onLinkChange;
    pc.onconnectionstatechange = onLinkChange;

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
    ['live:existing-peers', 'live:peer-joined', 'live:signal', 'live:peer-left', 'live:viewer-count', 'live:connection-status',
      'live:chat-message', 'live:pin-message', 'live:reaction', 'live:tip', 'live:stream-ended', 'live:screen-share'].forEach((ev) => socket?.off(ev));
  }

  function attachListeners(socket) {
    detachListeners();

    socket.on('live:existing-peers', async (existingPeers) => {
      await cameraPromiseRef.current; // offers must include our tracks
      for (const { socketId, username, userId, sharing } of existingPeers) {
        setPeers((prev) => ({ ...prev, [socketId]: { username, userId, sharing: !!sharing } }));
        const pc = createPeerConnection(socketId, socket);
        initiatorRef.current[socketId] = true;
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

    // Another participant's connection health (they report it, or the server saw their socket die).
    socket.on('live:connection-status', ({ socketId, username, state }) => {
      setPeerAlerts((prev) => {
        const next = { ...prev };
        if (state === 'ok') {
          if (next[socketId]?.local) next[socketId] = { ...next[socketId], remote: false };
          else delete next[socketId];
        } else {
          next[socketId] = { ...(next[socketId] || {}), username: username || peersRef.current[socketId]?.username, state, remote: true };
        }
        return next;
      });
    });

    socket.on('live:peer-left', ({ socketId }) => {
      peerConnectionsRef.current[socketId]?.close();
      delete peerConnectionsRef.current[socketId];
      delete linkRef.current[socketId];
      delete initiatorRef.current[socketId];
      reevaluateNetwork();
      // Keep a "lost" notice visible for a few seconds after they vanish, so people see who dropped.
      setPeerAlerts((prev) => {
        if (!prev[socketId]) return prev;
        if (prev[socketId].state !== 'lost') {
          const { [socketId]: _gone, ...rest } = prev;
          return rest;
        }
        setTimeout(() => setPeerAlerts((p) => { const { [socketId]: _x, ...r } = p; return r; }), 8000);
        return prev;
      });
      setPeers((prev) => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
    });

    // Someone started/stopped sharing their screen: their tile switches between letterboxed and cropped.
    socket.on('live:screen-share', ({ socketId, active }) => {
      setPeers((prev) => (prev[socketId] ? { ...prev, [socketId]: { ...prev[socketId], sharing: !!active } } : prev));
    });

    socket.on('live:viewer-count', ({ count }) => setViewerCount(count));
    socket.on('live:chat-message', (msg) => {
      setChatMessages((prev) => [...prev.slice(-199), msg]);
      if (!chatOpenRef.current) setUnreadChat((n) => n + 1);
    });
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
      if (!chatOpenRef.current) setUnreadChat((n) => n + 1);
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
    linkRef.current = {};
    initiatorRef.current = {};
    setPeerAlerts({});
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
    stopDisplayTracks();
    screenTrackRef.current = null;
    screenStreamRef.current = null;
    setScreenStream(null);
  }

  // Stops every track of the display stream (not just the video one) so the browser's
  // "sharing your screen" indicator goes away, and detaches onended so it can't re-enter.
  function stopDisplayTracks() {
    const tracks = new Set([...(screenStreamRef.current?.getTracks() || []), screenTrackRef.current].filter(Boolean));
    tracks.forEach((t) => {
      t.onended = null;
      try { t.stop(); } catch {}
    });
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

  // Front/back (phones) or next camera (desktops with several webcams). The old track is stopped
  // first because most phones can't open two cameras at once.
  async function flipCamera() {
    const current = localStreamRef.current;
    const oldTrack = current?.getVideoTracks()[0];
    if (!current || !oldTrack) return;
    const settings = oldTrack.getSettings?.() || {};
    let constraints;
    if (!settings.facingMode && devices.length > 1) {
      const idx = devices.findIndex((d) => d.deviceId === settings.deviceId);
      constraints = { deviceId: { exact: devices[(idx + 1) % devices.length].deviceId } };
    } else {
      constraints = { facingMode: { ideal: (settings.facingMode || facingMode) === 'user' ? 'environment' : 'user' } };
    }
    oldTrack.stop();
    let fresh = null;
    for (const video of [constraints, true]) {
      try {
        const got = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        fresh = got.getVideoTracks()[0];
        if (fresh) break;
      } catch {
        // try the plain fallback, then give up
      }
    }
    if (!fresh) {
      setCameraIssue('busy');
      return;
    }
    fresh.enabled = cameraOn;
    // New stream object so the preview tile rebinds cleanly.
    const next = new MediaStream([...current.getAudioTracks(), fresh]);
    localStreamRef.current = next;
    setLocalStream(next);
    setFacingMode(fresh.getSettings?.().facingMode === 'environment' ? 'environment' : 'user');
    if (!screenTrackRef.current) await swapOutgoingVideo(fresh); // a screen share keeps being what peers see
  }

  async function stopScreenShare() {
    if (!screenTrackRef.current) return; // already stopped (the browser bar and our button can both fire)
    stopDisplayTracks(); // screenStream.getTracks().forEach((t) => t.stop())
    screenTrackRef.current = null;
    screenStreamRef.current = null;
    setScreenStream(null);
    getSocket()?.emit('live:screen-share', { streamId, active: false });
    // Hand peers the camera track again. Its enabled flag already reflects the camera toggle, so a
    // camera that was off stays off (peers see the avatar), one that was on resumes immediately.
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
    getSocket()?.emit('live:screen-share', { streamId, active: true });
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
      <main className="min-h-screen flex items-center justify-center bg-zinc-950 px-6 text-center">
        {error ? (
          // Invite link to a stream that doesn't exist (or a network failure): say so and offer a way out.
          <div>
            <p className="text-lg font-extrabold text-white">{/not found/i.test(error) ? 'This live stream isn’t available' : 'Couldn’t open this live stream'}</p>
            <p className="text-sm text-zinc-400 mt-1.5">{/not found/i.test(error) ? 'The link may be wrong, or the stream was removed.' : 'Connection lost. Please try again.'}</p>
            <div className="flex justify-center gap-3 mt-5">
              <button type="button" onClick={() => router.push('/live')} className="px-5 py-2.5 rounded-xl bg-amber-500 text-black font-bold text-sm">Browse live streams</button>
              {!/not found/i.test(error) && <button type="button" onClick={() => window.location.reload()} className="px-5 py-2.5 rounded-xl bg-zinc-800 text-white font-bold text-sm">Try again</button>}
            </div>
          </div>
        ) : (
          <LoadingSpinner label="Loading…" />
        )}
      </main>
    );
  }

  const peerList = Object.entries(peers);
  const hasEnded = stream.status === 'ended';

  // ----- Stage layout -----
  // Priority: a screen share takes the stage (letterboxed so nothing is cropped). Otherwise the host
  // sees a grid of everyone, and a viewer sees the HOST full-screen. Remaining participants (and a
  // viewer's own camera) float as small tiles.
  const remoteWithMedia = peerList.filter(([, p]) => p.mediaStream);
  const hostEntry = peerList.find(([, p]) => p.userId === stream.hostId);
  const hostPeer = hostEntry && hostEntry[1].mediaStream ? hostEntry : null;
  // The local preview only ever shows the CAMERA. While sharing, the presenter slot renders a static
  // "You are sharing your screen" card instead of the display stream: previewing your own screen
  // inside the screen you're capturing is what produced the endless "hall of mirrors".
  const sharingSelf = !!screenStream;
  const watchingCount = Math.max(viewerCount - 1, 0); // everyone except you
  const localTile = {
    id: 'local',
    stream: sharingSelf ? null : localStream,
    label: isHost ? 'You' : '@you',
    muted: true,
    mirror: facingMode !== 'environment',
    contain: sharingSelf,
    sharingSelf,
    watchingCount,
    onStopSharing: stopScreenShare,
    forceAvatar: !sharingSelf && (!localStream || !cameraOn),
    avatarUrl: isHost ? stream.host?.avatarUrl : null,
    initial: isHost ? stream.host?.username?.[0] : 'Y',
    isLocal: true,
  };
  const remoteTile = ([socketId, p]) => ({
    id: socketId,
    stream: p.mediaStream,
    label: `@${p.username || '…'}`,
    muted: false,
    contain: !!p.sharing,
    avatarUrl: p.userId === stream.hostId ? stream.host?.avatarUrl : null,
    initial: p.username?.[0],
  });
  const remoteTiles = remoteWithMedia.map(remoteTile);
  const hasLocalPreview = !!(localStream || screenStream);
  const sharingTile = (sharingSelf ? localTile : null) || remoteTiles.find((t) => t.contain) || null;
  // While a screen is on stage, the shared content comes first: title card, pinned banner and extra
  // status chips step aside (chat lives in the drawer, pins are still readable there).
  const focusShare = !!sharingTile;

  let stageTiles = [];
  let stripTiles = [];
  if (sharingTile) {
    stageTiles = [sharingTile];
    stripTiles = [...(hasLocalPreview ? [localTile] : []), ...remoteTiles].filter((t) => t.id !== sharingTile.id);
  } else if (isHost) {
    stageTiles = [localTile, ...remoteTiles];
  } else {
    if (hostPeer) stageTiles = [remoteTile(hostPeer)];
    stripTiles = [...(hasLocalPreview ? [localTile] : []), ...remoteTiles.filter((t) => t.id !== hostPeer?.[0])];
  }
  if (stageTiles[0] && !stageTiles[0].isLocal && stageTiles[0].avatarUrl === null && stageTiles[0].id === hostPeer?.[0]) {
    stageTiles[0] = { ...stageTiles[0], avatarUrl: stream.host?.avatarUrl };
  }
  const canFlip = joined && !!localStream && (devices.length > 1 || facingMode === 'environment');

  return (
    <main className="relative min-h-screen h-screen w-full overflow-hidden bg-zinc-950 text-white flex flex-col">
      {/* ---------- Network status banners ---------- */}
      {netLost && (
        <div
          role="alert"
          className="fixed top-0 inset-x-0 z-[60] flex items-center justify-center gap-2 bg-red-600 text-white text-sm font-bold px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] shadow-lg"
        >
          <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" />
          Network connection lost. Reconnecting…
        </div>
      )}
      {!netLost && recovered && (
        <div role="status" className="fixed top-0 inset-x-0 z-[60] flex items-center justify-center bg-emerald-600 text-white text-sm font-bold px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] shadow-lg">
          Back online
        </div>
      )}
      {!netLost && Object.keys(peerAlerts).length > 0 && (
        <div className="fixed top-[max(3.25rem,calc(env(safe-area-inset-top)+2.5rem))] inset-x-0 z-[55] flex flex-col items-center gap-1.5 px-4 pointer-events-none" role="status" aria-live="polite">
          {Object.entries(peerAlerts).map(([id, a]) => (
            <div key={id} className="max-w-full rounded-full bg-amber-500 text-black text-xs font-bold px-3.5 py-1.5 shadow-lg truncate">
              @{a.username || 'A participant'} connection is unstable or lost
            </div>
          ))}
        </div>
      )}

      {/* ---------- Video stage ---------- */}
      <div className="absolute inset-0 z-0 bg-zinc-950">
        {joined && stageTiles.length > GRID_SCROLL_AT ? (
          // Many participants (5–30): a scrolling responsive grid. Fixed-aspect cells that are never
          // cropped (object-contain), and the wrapper scrolls instead of shrinking tiles to slivers.
          <div className="absolute inset-x-0 top-[7.5rem] bottom-28 px-2 flex">
            <div className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 overflow-y-auto max-h-[75vh] content-start auto-rows-min no-scrollbar">
              {stageTiles.map((t) => (
                <StreamTile
                  key={t.id}
                  {...t}
                  contain
                  retryKey={previewNonce}
                  onPlayBlocked={t.isLocal ? () => setCameraIssue((c) => c || 'play') : undefined}
                  className="w-full aspect-[4/3] rounded-xl overflow-hidden border border-zinc-800 bg-black"
                />
              ))}
            </div>
          </div>
        ) : joined && stageTiles.length > 0 ? (
          <div className={`grid w-full h-full gap-0.5 auto-rows-fr ${gridColsClass(stageTiles.length)}`}>
            {stageTiles.map((t, i) => (
              <StreamTile
                key={t.id}
                {...t}
                hideLabel={focusShare}
                retryKey={previewNonce}
                onPlayBlocked={t.isLocal ? () => setCameraIssue((c) => c || 'play') : undefined}
                className={`w-full h-full min-h-0 ${stageTiles.length === 3 && i === 2 ? 'col-span-2' : ''}`}
              />
            ))}
          </div>
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
        {/* Scrims keep the overlays legible, but never tint a shared screen. */}
        {!sharingTile && <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70 pointer-events-none" />}
      </div>

      {/* ---------- Floating picture-in-picture tiles ---------- */}
      {joined && stripTiles.length > 0 && (
        <div className={`absolute right-3 z-20 flex flex-col gap-2 max-h-[55vh] overflow-y-auto no-scrollbar ${focusShare ? 'top-14' : 'top-20'}`}>
          {stripTiles.map((t) => (
            <StreamTile
              key={t.id}
              {...t}
              retryKey={previewNonce}
              onPlayBlocked={t.isLocal ? () => setCameraIssue((c) => c || 'play') : undefined}
              className={`${focusShare ? 'w-16 sm:w-24' : 'w-24 sm:w-32'} aspect-[3/4] rounded-xl overflow-hidden border border-zinc-700 shadow-xl`}
              hideLabel={focusShare}
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
          {!sharingSelf && (
            <span className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 text-zinc-200 text-xs font-semibold px-3 py-1.5 rounded-full">
              👁️ {formatViewers(viewerCount)}
            </span>
          )}
        </div>

      </div>

      {!focusShare && (
      <div className="relative z-20 px-4 mt-2">
        <div className="bg-zinc-900/70 backdrop-blur-md border border-zinc-800 rounded-2xl px-4 py-2.5 inline-block max-w-full">
          <p className="font-extrabold text-white truncate">{stream.title}</p>
          <p className="text-zinc-400 text-xs truncate">
            @{stream.host?.username}
            {stream.category && <span className="text-zinc-600"> · {stream.category}</span>}
          </p>
        </div>
      </div>
      )}

      {/* ---------- Pinned message banner ---------- */}
      {pinned && !focusShare && (
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

      {/* ---------- Bottom control bar ---------- */}
      {/* Anchored to the very bottom edge (the global bottom nav is hidden on /live/*), with
          home-indicator safe-area padding. The reaction tray, when toggled on, stacks just above the buttons. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-3 px-4 pt-3 pb-6 pointer-events-none ${focusShare ? '' : 'bg-gradient-to-t from-black/70 via-black/30 to-transparent'}`}
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {joined && !hasEnded && reactionsOpen && !chatOpen && (
          <div
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/55 backdrop-blur-md border border-white/10 px-2 py-1.5 shadow-2xl"
            style={{ animation: 'tray-in 0.18s ease-out' }}
            role="group"
            aria-label="Send a reaction"
          >
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => sendReaction(emoji)}
                aria-label={`React ${emoji}`}
                className="w-11 h-11 rounded-full hover:bg-white/10 flex items-center justify-center text-2xl transition active:scale-90"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2.5">
          {joined && (
            <ToolbarButton
              label={chatOpen ? 'Close chat' : 'Open chat'}
              active={chatOpen}
              onClick={chatOpen ? closeChat : openChat}
              badge={unreadChat}
            >
              <MessageSquare size={20} />
            </ToolbarButton>
          )}
          {(joined || isHost) && !hasEnded && (
            <ToolbarButton label="Invite friends" onClick={() => setShowInvite(true)}>
              <UserPlus size={20} />
            </ToolbarButton>
          )}
          {joined && !hasEnded && (
            <ToolbarButton
              label={reactionsOpen ? 'Hide reactions' : 'Show reactions'}
              active={reactionsOpen}
              onClick={() => setReactionsOpen((v) => !v)}
            >
              <Smile size={20} />
            </ToolbarButton>
          )}
          {!isHost && !hasEnded && (
            <button
              onClick={() => setShowTip(true)}
              className="w-11 h-11 rounded-full bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center font-extrabold text-lg shadow-lg transition active:scale-95"
              aria-label="Tip / Send Gift"
            >
              $
            </button>
          )}
          {joined && (
            <>
              <ToolbarButton label="Toggle microphone" danger={!micOn} onClick={toggleMic}>
                {micOn ? <Mic size={20} /> : <MicOff size={20} />}
              </ToolbarButton>
              <ToolbarButton label="Toggle camera" danger={!cameraOn} onClick={toggleCamera}>
                {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
              </ToolbarButton>
              {canFlip && (
                <ToolbarButton label="Flip camera" onClick={flipCamera}>
                  <SwitchCamera size={20} />
                </ToolbarButton>
              )}
              {canDisplayShare && (isHost || localStream) && (
                <ToolbarButton
                  label={screenStream ? 'Stop sharing screen' : 'Share screen'}
                  active={!!screenStream}
                  onClick={screenStream ? stopScreenShare : startScreenShare}
                >
                  <MonitorUp size={20} />
                </ToolbarButton>
              )}
            </>
          )}
          {isHost && !hasEnded && (
            <button
              onClick={handleEndStream}
              disabled={ending}
              className="h-11 px-4 rounded-full bg-red-600 hover:bg-red-500 text-white text-sm font-bold flex items-center gap-2 shadow-lg transition active:scale-95 disabled:opacity-50"
              aria-label="End stream"
            >
              <PhoneOff size={18} /> {ending ? 'Ending…' : 'End'}
            </button>
          )}
        </div>
        <style>{`@keyframes tray-in { from { transform: translateY(8px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>
      </div>

      {/* ---------- Chat drawer (slides up from the bottom) ---------- */}
      {chatOpen && (
        <div
          className="fixed inset-x-0 bottom-0 z-[60] flex justify-center"
          role="dialog"
          aria-label="Live chat"
          style={{ transform: `translateY(${sheetDragY}px)`, transition: dragStartRef.current == null ? 'transform 0.2s ease-out' : 'none' }}
        >
          <div
            className="w-full max-w-xl bg-black/80 backdrop-blur-md rounded-t-3xl p-4 max-h-[50vh] min-h-[16rem] flex flex-col border-t border-x border-white/10 shadow-2xl"
            style={{ animation: 'sheet-up 0.22s ease-out', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            {/* drag handle */}
            <div
              className="-mt-2 mb-1 pt-2 pb-2 flex justify-center cursor-grab touch-none"
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              aria-label="Drag down to close chat"
            >
              <span className="w-10 h-1.5 rounded-full bg-white/30" />
            </div>
            <div className="flex items-center justify-between mb-2">
              <p className="font-extrabold text-sm text-white">Live chat</p>
              <button
                onClick={closeChat}
                aria-label="Close chat"
                className="w-8 h-8 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
              {chatMessages.length === 0 && (
                <p className="text-xs text-zinc-500 text-center py-6">No messages yet — say hi 👋</p>
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
              <form onSubmit={sendChat} className="shrink-0 flex items-center gap-2 pt-3 mt-2 border-t border-white/10">
                <input
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Say something…"
                  className="flex-1 min-w-0 bg-white/10 text-white placeholder:text-zinc-400 text-sm rounded-full px-4 py-2.5 outline-none border border-transparent focus:border-amber-500/60"
                />
                <button
                  type="submit"
                  disabled={!chatText.trim()}
                  className="w-10 h-10 shrink-0 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-bold flex items-center justify-center transition-colors disabled:opacity-40"
                  aria-label="Send"
                >
                  ➤
                </button>
              </form>
            )}
          </div>
          <style>{`@keyframes sheet-up { from { transform: translateY(100%) } to { transform: none } }`}</style>
        </div>
      )}

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

      {showInvite && <InviteSheet streamId={streamId} stream={stream} onClose={() => setShowInvite(false)} />}

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

function ToolbarButton({ label, onClick, active, danger, badge, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : !!active}
      title={label}
      className={`relative w-11 h-11 rounded-full flex items-center justify-center transition active:scale-95 ${
        danger
          ? 'bg-red-600/90 text-white'
          : active
          ? 'bg-amber-500 text-black'
          : 'bg-white/10 hover:bg-white/20 text-white'
      }`}
    >
      {children}
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-600 text-white text-[10px] font-extrabold flex items-center justify-center border border-black/40">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
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

// Up to this many tiles keep the immersive edge-to-edge layout; beyond it we switch to the scrolling grid.
const GRID_SCROLL_AT = 4;

function gridColsClass(n) {
  if (n <= 1) return 'grid-cols-1';
  if (n === 2) return 'grid-cols-1 sm:grid-cols-2'; // stacked on portrait phones, side by side when wide
  if (n <= 4) return 'grid-cols-2';
  return 'grid-cols-3';
}

// One participant: plays the stream (audio included, unless muted) and falls back to an avatar
// when there is no live video track (camera off, audio-only peer, still connecting).
function StreamTile({ stream, label, muted, mirror, contain, forceAvatar, avatarUrl, initial, className = '', compact, retryKey, onPlayBlocked, sharingSelf, watchingCount = 0, onStopSharing, hideLabel }) {
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

  const showAvatar = !sharingSelf && (forceAvatar || !hasVideo);
  if (sharingSelf) {
    // No <video> at all: nothing of our own screen is ever rendered back to us.
    return (
      <div className={`relative overflow-hidden bg-zinc-950 ${className}`}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center bg-gradient-to-br from-zinc-900 to-zinc-950">
          <span className="w-14 h-14 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 flex items-center justify-center">
            <MonitorUp size={26} />
          </span>
          <p className="font-extrabold text-lg text-white">You are sharing your screen</p>
          <p className="text-sm text-zinc-400 flex items-center gap-1.5" role="status">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
            {watchingCount === 1 ? '1 viewer watching' : `${watchingCount} viewers watching`}
          </p>
          <button
            type="button"
            onClick={onStopSharing}
            className="mt-1 h-10 px-5 rounded-full bg-red-600 hover:bg-red-500 text-white text-sm font-bold shadow-lg transition active:scale-95"
          >
            Stop sharing
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden ${contain ? 'bg-black' : 'bg-zinc-900'} ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={!!muted}
        // A shared screen is letterboxed (object-contain) so wide desktop content is never cropped.
        className={`absolute inset-0 z-0 w-full h-full ${contain ? 'object-contain bg-black' : 'object-cover'} ${mirror ? 'scale-x-[-1]' : ''} ${showAvatar ? 'invisible' : ''}`}
      />
      {showAvatar && (
        <div className="absolute inset-0 z-0 flex items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950">
          <div className={`${compact ? 'w-12 h-12 text-lg' : 'w-24 h-24 text-2xl'} rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center font-bold text-zinc-500`}>
            {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : (initial || '?').toUpperCase()}
          </div>
        </div>
      )}
      {label && !hideLabel && (
        <span className="absolute bottom-1.5 left-1.5 z-10 text-[10px] font-semibold text-white bg-black/70 px-1.5 py-0.5 rounded-md">
          {label}
        </span>
      )}
    </div>
  );
}
