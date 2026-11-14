'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSocketContext } from './SocketContext';
import { CallPeer, describeMediaError, getLocalMedia, isWebRtcSupported, stopStream } from '../lib/webrtc';
import { startRingtone } from '../lib/ringtone';
import CallModal from '../components/CallModal';

// 1:1 voice/video calls. Signaling rides the existing authenticated Socket.IO connection
// (backend/src/realtime/socket.js: call:offer / answer / ice / decline / end); media is
// peer-to-peer WebRTC (lib/webrtc.js). Mounted globally so an incoming call rings on any page.
//
// call.status: 'calling' (outgoing, ringing) | 'incoming' | 'connecting' | 'connected' | 'ended'
const RING_TIMEOUT_MS = 45000;
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

  const setCall = useCallback((next) => {
    const value = typeof next === 'function' ? next(callRef.current) : next;
    callRef.current = value;
    setCallState(value);
  }, []);

  const clearTimers = () => {
    clearTimeout(ringTimerRef.current);
    clearTimeout(graceTimerRef.current);
  };

  // Release everything. With a reason the modal lingers briefly on an "ended" card, then closes.
  const teardown = useCallback(
    (reason) => {
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
            setConnectedAt((prev) => prev || Date.now());
            setCall({ ...c, status: 'connected' });
          } else if (state === 'disconnected') {
            clearTimeout(graceTimerRef.current);
            graceTimerRef.current = setTimeout(() => {
              const cur = callRef.current;
              if (cur && cur.status !== 'ended') {
                socket?.emit('call:end', { toUserId: cur.peer.id, callId: cur.callId });
                teardown('Connection lost');
              }
            }, DISCONNECT_GRACE_MS);
          } else if (state === 'failed') {
            socket?.emit('call:end', { toUserId: c.peer.id, callId: c.callId });
            teardown('Connection failed');
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
        flushOutIce();
        ringTimerRef.current = setTimeout(() => {
          const c = callRef.current;
          if (c?.callId === callId && c.status === 'calling') {
            socket.emit('call:end', { toUserId: peerUser.id, callId });
            teardown('No answer');
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
    teardown();
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
      ifCurrent(callId, () => teardown('Call declined'));
    }
    function onEnd({ callId }) {
      ifCurrent(callId, (c) => teardown(c.status === 'incoming' ? 'Missed call' : 'Call ended'));
    }
    function onBusy({ callId }) {
      ifCurrent(callId, () => teardown('User is busy on another call'));
    }
    function onUnavailable({ callId, reason }) {
      ifCurrent(callId, () =>
        teardown(reason === 'offline' ? 'User is offline right now' : "You can't call this person")
      );
    }
    function onHandled({ callId }) {
      // Answered/declined on another of this user's tabs or devices.
      ifCurrent(callId, (c) => {
        if (c.status === 'incoming') teardown();
      });
    }
    function onDisconnect() {
      if (callRef.current && callRef.current.status !== 'ended') teardown('Connection lost');
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
