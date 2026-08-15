'use client';

import { useEffect, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useCameraDevices } from '@/lib/useCameraDevices';
import CameraDeviceSelect from '@/components/CameraDeviceSelect';
import { LoadingSpinner } from '@/components/LoadingScreen';
import TipModal from '@/components/TipModal';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const QUICK_REACTIONS = ['❤️', '🔥', '😂', '👏', '🎉', '😮'];

function formatViewers(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return `${n}`;
}

export default function LiveRoomPage({ params }) {
  const resolvedParams = use(params);
  const streamId = resolvedParams.id;
  const router = useRouter();

  const [stream, setStream] = useState(null);
  const [joined, setJoined] = useState(false);
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({}); // socketId -> RTCPeerConnection
  const chatScrollRef = useRef(null);
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

  function createPeerConnection(socketId, socket) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
    }

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

  async function handleJoin() {
    setError(null);
    let media;
    try {
      media = await navigator.mediaDevices.getUserMedia(buildConstraints({ audio: true }));
    } catch {
      setError('Camera/mic access is required to join with video. You can still watch and chat below.');
    }

    if (media) {
      localStreamRef.current = media;
      if (localVideoRef.current) localVideoRef.current.srcObject = media;
    }

    const socket = getSocket();
    if (!socket) {
      setError('Not authenticated.');
      return;
    }

    socket.on('live:existing-peers', async (existingPeers) => {
      for (const { socketId, username } of existingPeers) {
        setPeers((prev) => ({ ...prev, [socketId]: { username } }));
        const pc = createPeerConnection(socketId, socket);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('live:signal', { to: socketId, signal: offer });
      }
    });

    socket.on('live:peer-joined', ({ socketId, username }) => {
      setPeers((prev) => ({ ...prev, [socketId]: { username } }));
    });

    socket.on('live:signal', async ({ from, signal }) => {
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
      setFloatingReactions((prev) => [...prev, { ...r, flightId, x: 10 + Math.random() * 70 }]);
      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((f) => f.flightId !== flightId));
      }, 2200);
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

    socket.emit('live:join', streamId);
    setJoined(true);
  }

  function cleanupAll() {
    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
    peerConnectionsRef.current = {};
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    const socket = getSocket();
    socket?.emit('live:leave');
    socket?.off('live:existing-peers');
    socket?.off('live:peer-joined');
    socket?.off('live:signal');
    socket?.off('live:peer-left');
    socket?.off('live:viewer-count');
    socket?.off('live:chat-message');
    socket?.off('live:pin-message');
    socket?.off('live:reaction');
    socket?.off('live:tip');
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
    setShowEmojiPicker(false);
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

  return (
    <main className="relative min-h-screen h-screen w-full overflow-hidden bg-zinc-950 text-white flex flex-col">
      {/* ---------- Full-screen video backdrop ---------- */}
      <div className="absolute inset-0">
        {joined ? (
          <div className="w-full h-full grid grid-cols-1">
            <div className="relative w-full h-full bg-zinc-900">
              {localStreamRef.current ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`w-full h-full object-cover ${cameraOn ? '' : 'hidden'}`}
                />
              ) : null}
              {(!cameraOn || !localStreamRef.current) && (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950">
                  <div className="w-24 h-24 rounded-full bg-zinc-800 overflow-hidden">
                    {stream.host?.avatarUrl ? (
                      <img src={stream.host.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-zinc-500">
                        {stream.host?.username?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-zinc-900 to-zinc-950 flex items-center justify-center">
            {stream.host?.avatarUrl && (
              <img src={stream.host.avatarUrl} alt="" className="w-full h-full object-cover opacity-30" />
            )}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70 pointer-events-none" />
      </div>

      {/* ---------- Co-host / guest PiP grid ---------- */}
      {joined && peerList.length > 0 && (
        <div className="absolute top-20 right-3 z-20 flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
          {peerList.map(([socketId, peer]) => (
            <PeerVideo key={socketId} peer={peer} />
          ))}
        </div>
      )}

      {/* ---------- Floating emoji reactions ---------- */}
      <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
        {floatingReactions.map((r) => (
          <span
            key={r.flightId}
            className="absolute bottom-24 text-3xl animate-[float-up_2.2s_ease-out_forwards]"
            style={{ left: `${r.x}%` }}
          >
            {r.emoji}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes float-up {
          0% { transform: translateY(0) scale(0.8); opacity: 0; }
          15% { opacity: 1; transform: translateY(-10px) scale(1); }
          100% { transform: translateY(-260px) scale(1.1); opacity: 0; }
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

      {error && (
        <div className="relative z-20 px-4 mb-2">
          <p className="text-sm text-red-400 bg-zinc-900/80 backdrop-blur-md border border-red-500/30 rounded-xl px-4 py-2 max-w-sm">
            {error}
          </p>
        </div>
      )}

      {/* ---------- Join CTA ---------- */}
      {!joined && !hasEnded && (
        <div className="relative z-20 px-4 pb-6 flex flex-col items-center gap-3">
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
            onClick={handleJoin}
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3.5 rounded-2xl transition-all shadow-2xl"
          >
            Join with camera
          </button>
        </div>
      )}

      {/* ---------- Bottom bar ---------- */}
      <div className="relative z-20 flex items-end justify-between gap-3 p-4">
        <div className="w-full max-w-sm bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
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
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  className="w-9 h-9 shrink-0 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-base transition-colors"
                  aria-label="React"
                >
                  😀
                </button>
                {showEmojiPicker && (
                  <div className="absolute bottom-11 left-0 bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-2xl p-2 flex gap-1 shadow-2xl">
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => sendReaction(emoji)}
                        className="w-8 h-8 flex items-center justify-center text-lg hover:scale-125 transition-transform"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
            </>
          )}
        </div>
      </div>

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

function PeerVideo({ peer }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && peer.mediaStream) ref.current.srcObject = peer.mediaStream;
  }, [peer.mediaStream]);

  return (
    <div className="w-32 sm:w-40 aspect-video bg-zinc-900/90 backdrop-blur-md rounded-xl overflow-hidden relative border border-zinc-800 shadow-xl">
      {peer.mediaStream ? (
        <video ref={ref} autoPlay playsInline className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-500">
          Connecting…
        </div>
      )}
      <span className="absolute bottom-1 left-1 text-[10px] text-white bg-black/70 px-1.5 py-0.5 rounded-md">
        @{peer.username || '…'}
      </span>
    </div>
  );
}
