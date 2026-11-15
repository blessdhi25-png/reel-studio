'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useSocketContext } from './SocketContext';
import { CallPeer, describeMediaError, getLocalMedia, isWebRtcSupported, stopStream } from '../lib/webrtc';
import { startRingtone } from '../lib/ringtone';
import CallModal from '../components/CallModal';

// 1:1 voice/video calls. Signaling rides the existing authenticated Socket.IO connection
// (backend/src/realtime/socket.js: call:offer / answer / ice / decline / end); media is
// peer-to-peer WebRTC (lib/webrtc.js). Mounted globally so an incoming call rings on any page.
//
// Call history: when an OUTGOING call finishes, the caller's client POSTs a CallLog row
// (COMPLETED + duration | MISSED | NO_ANSWER | DECLINED). Only the caller logs, so each call is
// recorded once; the server fans the row out to both users over socket event `call:logged`.
//
// call.status: 'calling' (outgoing, ringing) | 'incoming' | 'connecting' | 'connected' | 'ended'
const RING_TIMEOUT_MS = 30000;
const DISCONNECT_GRACE_MS = 10000;
const ENDED_LINGER_MS = 2200;

const CallContext = createContext(null);

function newCallId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CallProvider({ children }) {
  const { socket, connected } = useSocketContext();

  const [call, setCallState] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [connectedAt, setConnectedAt] = useState(null);

  const callRef = useRef(null); // always-current mirror so socket handlers never read stale state
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const incomingOfferRef = useRef(null);
  const pendingIceRef = useRef([]); // remote ICE that arrives before we have a peer (callee, pre-accept)
  const outIceRef = useRef({ ready: false, queue: [] });
  const stopRingRef = useRef(null);
  const ringTimerRef = useRef(null);
  const graceTimerRef = useRef(null);
  const lingerTimerRef = useRef(null);
  const connectedAtRef = useRef(null);
  const offerSentRef = useRef(false);
  const loggedRef = useRef(new Set()); // callIds already persisted

  const setCall = useCallback((next) => {
    const value = typeof next === 'function' ? next(callRef.current) : next;
    callRef.current = value;
    setCallState(value);
  }, []);

  const clearTimers = () => {
    clearTimeout(ringTimerRef.current);
    clearTimeout(graceTimerRef.current);
  };

  // Persist the finished call (caller side only; each call id is logged at most once).
  const persistCall = (c, status) => {
    if (!c || c.direction !== 'outgoing' || !c.callId || loggedRef.current.has(c.callId)) return;
    loggedRef.current.add(c.callId);
    const durationSeconds =
      status === 'COMPLETED' && connectedAtRef.current
        ? Math.max(0, Math.round((Date.now() - connectedAtRef.current) / 1000))
        : 0;
    api
      .logCall({
        callId: c.callId,
        receiverId: c.peer.id,
        callType: c.callType === 'video' ? 'VIDEO' : 'VOICE',
        status,
        durationSeconds,
      })
      .catch(() => {}); // history is best-effort; never block ending the call
  };
  // How a call that wasn't declined/timed out ended: talked => COMPLETED, otherwise the caller gave up.
  const hangupStatus = () => (connectedAtRef.current ? 'COMPLETED' : 'MISSED');

  // Release everything. With a reason the modal lingers briefly on an "ended" card, then closes.
  // `logStatus` (optional) persists the call to history before state is cleared.
  const teardown = useCallback(
    (reason, logStatus) => {
      if (logStatus) persistCall(callRef.current, logStatus);
      connectedAtRef.current = null;
      offerSentRef.current = false;
      clearTimers();
      clearTimeout(lingerTimerRef.current);
      stopRingRef.current?.();
      stopRingRef.current = null;
      peerRef.current?.close();
      peerRef.current = null;
      stopStream(localStreamRef.current);
      localStreamRef.current = null;
      incomingOfferRef.current = null;
      pendingIceRef.current = [];
      outIceRef.current = { ready: false, queue: [] };
      setLocalStream(null);
      setRemoteStream(null);
      setConnectedAt(null);
      setMuted(false);
      setVideoOff(false);
      setSpeakerOn(true);

      const current = callRef.current;
      if (reason && current) {
        setCall({ ...current, status: 'ended', endReason: reason });
        lingerTimerRef.current = setTimeout(() => setCall(null), ENDED_LINGER_MS);
      } else {
        setCall(null);
      }
    },
    [setCall]
  );

  // Candidates generated before the offer/answer has been emitted would be dropped by the
  // server (no call registered yet), so hold them until signalling is ready.
  const sendIce = useCallback(
    (candidate) => {
      const c = callRef.current;
      if (!c || !socket) return;
      if (!outIceRef.current.ready) {
        outIceRef.current.queue.push(candidate);
        return;
      }
      socket.emit('call:ice', { toUserId: c.peer.id, callId: c.callId, candidate });
    },
    [socket]
  );

  const flushOutIce = useCallback(() => {
    outIceRef.current.ready = true;
    const queued = outIceRef.current.queue.splice(0);
    queued.forEach(sendIce);
  }, [sendIce]);

  const buildPeer = useCallback(
    (stream) =>
      new CallPeer({
        localStream: stream,
        onRemoteStream: (s) => setRemoteStream(s),
        onIceCandidate: sendIce,
        onConnectionState: (state) => {
          const c = callRef.current;
          if (!c || c.status === 'ended') return;
          if (state === 'connected') {
            clearTimeout(graceTimerRef.current);
            if (!connectedAtRef.current) connectedAtRef.current = Date.now();
            setConnectedAt((prev) => prev || connectedAtRef.current);
            setCall({ ...c, status: 'connected' });
          } else if (state === 'disconnected') {
            clearTimeout(graceTimerRef.current);
            graceTimerRef.current = setTimeout(() => {
              const cur = callRef.current;
              if (cur && cur.status !== 'ended') {
                socket?.emit('call:end', { toUserId: cur.peer.id, callId: cur.callId });
                teardown('Connection lost', hangupStatus());
              }
            }, DISCONNECT_GRACE_MS);
          } else if (state === 'failed') {
            socket?.emit('call:end', { toUserId: c.peer.id, callId: c.callId });
            teardown('Connection failed', hangupStatus());
          }
        },
      }),
    [sendIce, setCall, socket, teardown]
  );

  // ---------- Caller ----------
  const startCall = useCallback(
    async (peerUser, callType) => {
      if (callRef.current) return; // one call at a time
      if (!peerUser?.id) return;
      if (!socket || !connected) {
        setCall({ callId: null, direction: 'outgoing', status: 'ended', callType, peer: peerUser, endReason: "You're offline. Try again in a moment." });
        lingerTimerRef.current = setTimeout(() => setCall(null), ENDED_LINGER_MS + 800);
        return;
      }
      if (!isWebRtcSupported()) {
        setCall({ callId: null, direction: 'outgoing', status: 'ended', callType, peer: peerUser, endReason: "This browser doesn't support calls." });
        lingerTimerRef.current = setTimeout(() => setCall(null), ENDED_LINGER_MS + 800);
        return;
      }

      const callId = newCallId();
      outIceRef.current = { ready: false, queue: [] };
      setCall({ callId, direction: 'outgoing', status: 'calling', callType, peer: peerUser });

      let stream;
      try {
        stream = await getLocalMedia(callType);
      } catch (err) {
        if (callRef.current?.callId === callId) teardown(describeMediaError(err, callType === 'video'));
        return;
      }
      if (callRef.current?.callId !== callId) {
        stopStream(stream); // cancelled while the permission prompt was open
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);

      try {
        const peer = buildPeer(stream);
        peerRef.current = peer;
        const offer = await peer.createOffer();
        if (callRef.current?.callId !== callId) return;
        socket.emit('call:offer', { toUserId: peerUser.id, callId, callType, sdp: offer });
        offerSentRef.current = true;
        flushOutIce();
        ringTimerRef.current = setTimeout(() => {
          const c = callRef.current;
          if (c?.callId === callId && c.status === 'calling') {
            socket.emit('call:end', { toUserId: peerUser.id, callId });
            teardown('No answer', 'NO_ANSWER');
          }
        }, RING_TIMEOUT_MS);
      } catch {
        if (callRef.current?.callId === callId) teardown('Could not start the call');
      }
    },
    [socket, connected, setCall, teardown, buildPeer, flushOutIce]
  );

  // ---------- Callee ----------
  const acceptCall = useCallback(async () => {
    const c = callRef.current;
    if (!c || c.status !== 'incoming' || !socket) return;
    clearTimers();
    stopRingRef.current?.();
    stopRingRef.current = null;
    setCall({ ...c, status: 'connecting' });
    outIceRef.current = { ready: false, queue: [] };

    let stream;
    try {
      stream = await getLocalMedia(c.callType);
    } catch (err) {
      socket.emit('call:decline', { toUserId: c.peer.id, callId: c.callId });
      if (callRef.current?.callId === c.callId) teardown(describeMediaError(err, c.callType === 'video'));
      return;
    }
    if (callRef.current?.callId !== c.callId) {
      stopStream(stream);
      return;
    }
    localStreamRef.current = stream;
    setLocalStream(stream);

    try {
      const peer = buildPeer(stream);
      peerRef.current = peer;
      const answer = await peer.acceptOffer(incomingOfferRef.current);
      socket.emit('call:answer', { toUserId: c.peer.id, callId: c.callId, sdp: answer });
      flushOutIce();
      const queued = pendingIceRef.current.splice(0);
      queued.forEach((cand) => peer.addIceCandidate(cand));
    } catch {
      socket.emit('call:end', { toUserId: c.peer.id, callId: c.callId });
      teardown('Could not connect the call');
    }
  }, [socket, setCall, teardown, buildPeer, flushOutIce]);

  const declineCall = useCallback(() => {
    const c = callRef.current;
    if (!c) return;
    socket?.emit('call:decline', { toUserId: c.peer.id, callId: c.callId });
    teardown();
  }, [socket, teardown]);

  // Hang up (or cancel while ringing).
  const endCall = useCallback(() => {
    const c = callRef.current;
    if (!c) return;
    if (c.status === 'ended') {
      teardown();
      return;
    }
    if (c.status === 'incoming') return declineCall();
    socket?.emit('call:end', { toUserId: c.peer.id, callId: c.callId });
    // Cancelling before the offer even went out (e.g. during the permission prompt) never rang anyone.
    teardown(undefined, c.status === 'calling' && !offerSentRef.current ? undefined : hangupStatus());
  }, [socket, teardown, declineCall]);

  // ---------- Controls ----------
  const toggleMute = useCallback(() => {
    const next = !muted;
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) track.enabled = !next;
    setMuted(next);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    const next = !videoOff;
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) track.enabled = !next;
    setVideoOff(next);
  }, [videoOff]);

  const toggleSpeaker = useCallback(() => setSpeakerOn((v) => !v), []);

  // ---------- Incoming signalling ----------
  useEffect(() => {
    if (!socket) return undefined;

    function onOffer({ callId, callType, sdp, from }) {
      if (callRef.current) return; // already in a call (server also guards this)
      incomingOfferRef.current = sdp;
      pendingIceRef.current = [];
      setCall({ callId, direction: 'incoming', status: 'incoming', callType, peer: from });
      stopRingRef.current?.();
      stopRingRef.current = startRingtone();
      ringTimerRef.current = setTimeout(() => {
        const c = callRef.current;
        if (c?.callId === callId && c.status === 'incoming') {
          socket.emit('call:decline', { toUserId: c.peer.id, callId });
          teardown('Missed call');
        }
      }, RING_TIMEOUT_MS);
    }

    function onAnswer({ callId, sdp }) {
      const c = callRef.current;
      if (!c || c.callId !== callId || c.direction !== 'outgoing') return;
      clearTimeout(ringTimerRef.current);
      setCall({ ...c, status: 'connecting' });
      peerRef.current?.setAnswer(sdp).catch(() => {
        socket.emit('call:end', { toUserId: c.peer.id, callId });
        teardown('Could not connect the call');
      });
    }

    function onIce({ callId, candidate }) {
      const c = callRef.current;
      if (!c || c.callId !== callId) return;
      if (peerRef.current) peerRef.current.addIceCandidate(candidate);
      else pendingIceRef.current.push(candidate);
    }

    const ifCurrent = (callId, fn) => {
      const c = callRef.current;
      if (c && c.callId === callId) fn(c);
    };

    function onDecline({ callId }) {
      ifCurrent(callId, () => teardown('Call declined', 'DECLINED'));
    }
    function onEnd({ callId }) {
      ifCurrent(callId, (c) => teardown(c.status === 'incoming' ? 'Missed call' : 'Call ended', hangupStatus()));
    }
    function onBusy({ callId }) {
      ifCurrent(callId, () => teardown('User is busy on another call', 'NO_ANSWER'));
    }
    function onUnavailable({ callId, reason }) {
      ifCurrent(callId, () =>
        teardown(
          reason === 'offline' ? 'User is offline right now' : "You can't call this person",
          reason === 'offline' ? 'NO_ANSWER' : undefined // offline callees still get a missed-call entry
        )
      );
    }
    function onHandled({ callId }) {
      // Answered/declined on another of this user's tabs or devices.
      ifCurrent(callId, (c) => {
        if (c.status === 'incoming') teardown();
      });
    }
    function onDisconnect() {
      if (callRef.current && callRef.current.status !== 'ended') teardown('Connection lost', hangupStatus());
    }

    socket.on('call:offer', onOffer);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice', onIce);
    socket.on('call:decline', onDecline);
    socket.on('call:end', onEnd);
    socket.on('call:busy', onBusy);
    socket.on('call:unavailable', onUnavailable);
    socket.on('call:handled', onHandled);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('call:offer', onOffer);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice', onIce);
      socket.off('call:decline', onDecline);
      socket.off('call:end', onEnd);
      socket.off('call:busy', onBusy);
      socket.off('call:unavailable', onUnavailable);
      socket.off('call:handled', onHandled);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket, setCall, teardown]);

  // Feed audio suppression: while a call is ringing or live, silence and pause every feed/story video
  // (including ones that try to autoplay as the person scrolls), then restore them afterwards.
  const callActive = !!call && call.status !== 'ended';
  useEffect(() => {
    if (!callActive) return undefined;
    const SELECTOR = 'video[data-feed-media]';
    const saved = new Map(); // element -> { muted, wasPlaying }
    const silence = (el) => {
      if (!saved.has(el)) saved.set(el, { muted: el.muted, wasPlaying: !el.paused });
      el.muted = true;
      if (!el.paused) el.pause();
    };
    document.querySelectorAll(SELECTOR).forEach(silence);
    // `play` doesn't bubble, so listen in the capture phase to catch autoplay from any card.
    const onPlay = (e) => {
      if (e.target?.matches?.(SELECTOR)) silence(e.target);
    };
    document.addEventListener('play', onPlay, true);
    return () => {
      document.removeEventListener('play', onPlay, true);
      saved.forEach(({ muted, wasPlaying }, el) => {
        if (!el.isConnected) return;
        el.muted = muted;
        const r = el.getBoundingClientRect();
        const onScreen = r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
        if (wasPlaying && onScreen) el.play().catch(() => {});
      });
    };
  }, [callActive]);

  // Provider unmount (e.g. logout): release devices.
  useEffect(
    () => () => {
      clearTimeout(lingerTimerRef.current);
      clearTimers();
      stopRingRef.current?.();
      peerRef.current?.close();
      stopStream(localStreamRef.current);
    },
    []
  );

  const value = useMemo(
    () => ({
      call,
      inCall: !!call,
      localStream,
      remoteStream,
      muted,
      videoOff,
      speakerOn,
      connectedAt,
      startCall,
      acceptCall,
      declineCall,
      endCall,
      toggleMute,
      toggleCamera,
      toggleSpeaker,
    }),
    [call, localStream, remoteStream, muted, videoOff, speakerOn, connectedAt, startCall, acceptCall, declineCall, endCall, toggleMute, toggleCamera, toggleSpeaker]
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      {call && <CallModal />}
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall() must be used within <CallProvider>');
  return ctx;
}
