'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { getSocket } from '../../../lib/socket';
import { useCameraDevices } from '../../../lib/useCameraDevices';
import CameraDeviceSelect from '../../../components/CameraDeviceSelect';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export default function LiveRoomPage({ params }) {
  const { id: streamId } = params;
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

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({}); // socketId -> RTCPeerConnection
  const chatBottomRef = useRef(null);
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
      })
      .catch((err) => setError(err.message));

    return () => cleanupAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId, router]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    } catch (err) {
      setError('Camera/mic access is required to join. You can still watch chat from the stream page.');
      return;
    }

    localStreamRef.current = media;
    if (localVideoRef.current) localVideoRef.current.srcObject = media;

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
      // The newcomer initiates the offer to us — we just wait for their signal.
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
          // ICE candidates can arrive before remote description is set; safe to ignore occasional failures.
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
    socket.on('live:chat-message', (msg) => setChatMessages((prev) => [...prev, msg]));

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
      <main className="min-h-screen flex items-center justify-center">
        <p className="font-body text-smoke text-sm">{error || 'Loading…'}</p>
      </main>
    );
  }

  const peerList = Object.entries(peers);

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-smoke/10">
        <div>
          <a href="/live" className="font-mono text-xs text-smoke uppercase tracking-widest">
            ← Live
          </a>
          <p className="font-display text-xl text-bone tracking-wide mt-1">{stream.title}</p>
          <p className="font-body text-xs text-smoke">
            @{stream.host?.username} · {viewerCount} watching
          </p>
        </div>
        {isHost && stream.status === 'live' && (
          <button
            onClick={handleEndStream}
            disabled={ending}
            className="font-mono text-xs uppercase tracking-widest px-4 py-2 rounded-sprocket border border-red-400/40 text-red-400 disabled:opacity-50"
          >
            {ending ? 'Ending…' : 'End stream'}
          </button>
        )}
      </div>

      {stream.status === 'ended' && (
        <p className="font-body text-sm text-smoke text-center py-4">This stream has ended.</p>
      )}

      <div className="flex flex-1 flex-col md:flex-row">
        {/* Video grid */}
        <div className="flex-1 p-4">
          {!joined ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                {error && <p className="font-body text-sm text-red-400 mb-4 max-w-xs">{error}</p>}
                {devices.length > 1 && (
                  <div className="mb-4">
                    <CameraDeviceSelect
                      devices={devices}
                      selectedDeviceId={selectedDeviceId}
                      onChange={setSelectedDeviceId}
                      builtInDeviceId={builtInDeviceId}
                      className="bg-ink2 border border-smoke/30 text-bone text-xs rounded-sprocket px-3 py-2 outline-none"
                    />
                  </div>
                )}
                <button
                  onClick={handleJoin}
                  disabled={stream.status === 'ended'}
                  className="bg-reel text-ink font-body font-semibold px-6 py-3 rounded-sprocket disabled:opacity-50"
                >
                  Join with camera
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="aspect-video bg-ink2 rounded-sprocket overflow-hidden relative">
                <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                <span className="absolute bottom-1 left-1 font-mono text-[10px] text-reel bg-ink/70 px-1 rounded-sprocket">
                  You {!micOn && '(muted)'}
                </span>
              </div>
              {peerList.map(([socketId, peer]) => (
                <PeerVideo key={socketId} peer={peer} />
              ))}
            </div>
          )}
        </div>

        {/* Chat */}
        <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-smoke/10 flex flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 max-h-64 md:max-h-none">
            {chatMessages.map((m, i) => (
              <p key={i} className="font-body text-xs text-bone">
                <span className="text-reel">@{m.username}</span> {m.content}
              </p>
            ))}
            <div ref={chatBottomRef} />
          </div>
          <form onSubmit={sendChat} className="flex gap-2 p-3 border-t border-smoke/10">
            <input
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Say something…"
              className="flex-1 bg-ink2 text-bone font-body text-sm rounded-sprocket px-3 py-2 outline-none border border-transparent focus:border-reel/50"
            />
            <button
              type="submit"
              className="px-3 font-body text-sm font-semibold text-ink bg-reel rounded-sprocket"
            >
              Send
            </button>
          </form>
        </div>
      </div>

      {joined && (
        <div className="flex justify-center gap-3 py-4 border-t border-smoke/10">
          <button
            onClick={toggleMic}
            className={`font-mono text-xs uppercase tracking-widest px-4 py-2 rounded-sprocket border ${
              micOn ? 'border-smoke/30 text-smoke' : 'border-red-400/40 text-red-400'
            }`}
          >
            {micOn ? 'Mute' : 'Unmute'}
          </button>
          <button
            onClick={toggleCamera}
            className={`font-mono text-xs uppercase tracking-widest px-4 py-2 rounded-sprocket border ${
              cameraOn ? 'border-smoke/30 text-smoke' : 'border-red-400/40 text-red-400'
            }`}
          >
            {cameraOn ? 'Camera off' : 'Camera on'}
          </button>
        </div>
      )}
    </main>
  );
}

function PeerVideo({ peer }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && peer.mediaStream) ref.current.srcObject = peer.mediaStream;
  }, [peer.mediaStream]);

  return (
    <div className="aspect-video bg-ink2 rounded-sprocket overflow-hidden relative">
      {peer.mediaStream ? (
        <video ref={ref} autoPlay playsInline className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center font-mono text-[10px] text-smoke">
          Connecting…
        </div>
      )}
      <span className="absolute bottom-1 left-1 font-mono text-[10px] text-bone bg-ink/70 px-1 rounded-sprocket">
        @{peer.username || '…'}
      </span>
    </div>
  );
}
