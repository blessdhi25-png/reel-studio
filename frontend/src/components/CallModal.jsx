'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
import { useCall } from '../context/CallContext';

// Full-screen call UI, rendered by CallProvider whenever a call exists:
//  - incoming:  ringing card with Accept / Decline
//  - outgoing / connecting / connected: remote video full-screen, local preview picture-in-picture,
//    mute / camera / speaker / End controls
//  - ended: brief card with the reason (declined, no answer, ...)
function formatDuration(s) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function PeerAvatar({ peer, ringing }) {
  return (
    <span
      className={`w-32 h-32 rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center text-4xl font-bold text-amber-400 ring-4 ${
        ringing ? 'ring-amber-500/40 animate-pulse' : 'ring-zinc-700'
      }`}
    >
      {peer?.avatarUrl ? (
        <img src={peer.avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        peer?.username?.[0]?.toUpperCase() || '?'
      )}
    </span>
  );
}

export default function CallModal() {
  const {
    call, localStream, remoteStream, muted, videoOff, speakerOn, connectedAt,
    acceptCall, declineCall, endCall, toggleMute, toggleCamera, toggleSpeaker,
  } = useCall();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const [seconds, setSeconds] = useState(0);

  const isVideo = call.callType === 'video';
  const status = call.status;
  const live = status === 'connecting' || status === 'connected';

  // Local preview (picture-in-picture).
  useEffect(() => {
    const el = localVideoRef.current;
    if (el && localStream) {
      el.srcObject = localStream;
      el.play?.().catch(() => {});
    }
  }, [localStream, status]);

  // Remote media. Video calls render it full-screen; voice calls play through a hidden <audio>.
  // "Speaker off" silences the remote output.
  useEffect(() => {
    const el = isVideo ? remoteVideoRef.current : remoteAudioRef.current;
    if (el && remoteStream) {
      el.srcObject = remoteStream;
      el.play?.().catch(() => {});
    }
  }, [remoteStream, isVideo, status]);

  useEffect(() => {
    const el = isVideo ? remoteVideoRef.current : remoteAudioRef.current;
    if (el) el.muted = !speakerOn;
  }, [speakerOn, isVideo, remoteStream, status]);

  useEffect(() => {
    if (!connectedAt) {
      setSeconds(0);
      return undefined;
    }
    const tick = () => setSeconds(Math.floor((Date.now() - connectedAt) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [connectedAt]);

  const label =
    status === 'calling'
      ? 'Ringing…'
      : status === 'incoming'
      ? `Incoming ${isVideo ? 'video' : 'voice'} call`
      : status === 'connecting'
      ? 'Connecting…'
      : status === 'connected'
      ? formatDuration(seconds)
      : call.endReason || 'Call ended';

  // ----- Incoming -----
  if (status === 'incoming') {
    return (
      <div className="fixed inset-0 z-[90] bg-zinc-950/95 backdrop-blur-md text-white flex flex-col items-center justify-between py-16 px-6" role="alertdialog" aria-label="Incoming call">
        <div className="flex flex-col items-center gap-4 mt-10">
          <PeerAvatar peer={call.peer} ringing />
          <div className="text-center">
            <p className="font-extrabold text-2xl">@{call.peer?.username}</p>
            <p className="text-sm font-semibold text-zinc-400 mt-1 animate-pulse">{label}</p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-16 pb-[env(safe-area-inset-bottom)]">
          <div className="flex flex-col items-center gap-2">
            <button onClick={declineCall} aria-label="Decline call" className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-2xl transition active:scale-95">
              <PhoneOff size={26} />
            </button>
            <span className="text-xs font-semibold text-zinc-400">Decline</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button onClick={acceptCall} aria-label="Accept call" className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center shadow-2xl transition active:scale-95">
              {isVideo ? <Video size={26} /> : <Phone size={26} />}
            </button>
            <span className="text-xs font-semibold text-zinc-400">Accept</span>
          </div>
        </div>
      </div>
    );
  }

  // ----- Ended -----
  if (status === 'ended') {
    return (
      <div className="fixed inset-0 z-[90] bg-zinc-950/95 text-white flex flex-col items-center justify-center gap-4 px-6" role="dialog" aria-label="Call ended">
        <PeerAvatar peer={call.peer} />
        <p className="font-extrabold text-xl">@{call.peer?.username}</p>
        <p className="text-sm font-semibold text-zinc-400 text-center max-w-xs">{label}</p>
      </div>
    );
  }

  // ----- Outgoing / connecting / connected -----
  const remoteVideoVisible = isVideo && live && !!remoteStream;
  return (
    <div className="fixed inset-0 z-[90] bg-zinc-950 text-white flex flex-col" role="dialog" aria-label={`${isVideo ? 'Video' : 'Voice'} call`}>
      {/* Remote stage */}
      <div className="flex-1 relative flex flex-col items-center justify-center gap-4 px-6 bg-gradient-to-b from-zinc-900 to-zinc-950 overflow-hidden">
        {isVideo && (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`absolute inset-0 z-0 w-full h-full object-cover ${remoteVideoVisible ? '' : 'invisible'}`}
          />
        )}
        {!isVideo && <audio ref={remoteAudioRef} autoPlay />}

        {/* Avatar + status sit over the stage until remote video is flowing */}
        {!remoteVideoVisible && (
          <div className="relative z-10 flex flex-col items-center gap-4">
            <PeerAvatar peer={call.peer} ringing={status === 'calling'} />
            <div className="text-center">
              <p className="font-extrabold text-xl">@{call.peer?.username}</p>
              <p className={`text-sm font-semibold mt-1 ${status === 'connected' ? 'text-emerald-400' : 'text-zinc-400'}`}>
                {isVideo && status === 'calling' ? 'Video calling… Ringing…' : label}
              </p>
            </div>
          </div>
        )}
        {/* Slim status pill over live video */}
        {remoteVideoVisible && (
          <div className="absolute top-4 left-4 z-10 bg-black/50 backdrop-blur-md rounded-full px-3 py-1.5 text-xs font-bold">
            @{call.peer?.username} · {label}
          </div>
        )}

        {/* Local preview: picture-in-picture */}
        {isVideo && (
          <div className="absolute top-4 right-4 z-20 w-28 sm:w-36 aspect-[3/4] rounded-2xl overflow-hidden bg-zinc-800 border border-zinc-700 shadow-2xl">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-cover scale-x-[-1] ${localStream && !videoOff ? '' : 'invisible'}`}
            />
            {(!localStream || videoOff) && (
              <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
                <VideoOff size={22} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="shrink-0 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-5 flex items-center justify-center gap-5 bg-zinc-950">
        <RoundButton onClick={toggleMute} active={muted} label={muted ? 'Unmute' : 'Mute'}>
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </RoundButton>
        {isVideo && (
          <RoundButton onClick={toggleCamera} active={videoOff} label={videoOff ? 'Turn camera on' : 'Turn camera off'}>
            {videoOff ? <VideoOff size={22} /> : <Video size={22} />}
          </RoundButton>
        )}
        <RoundButton onClick={toggleSpeaker} active={!speakerOn} label={speakerOn ? 'Speaker on' : 'Speaker off'}>
          {speakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
        </RoundButton>
        <button
          onClick={endCall}
          aria-label="End call"
          className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-2xl transition active:scale-95"
        >
          <PhoneOff size={26} />
        </button>
      </div>
    </div>
  );
}

function RoundButton({ onClick, active, label, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={!!active}
      className={`w-14 h-14 rounded-full flex items-center justify-center transition active:scale-95 ${
        active ? 'bg-white text-black' : 'bg-zinc-800 hover:bg-zinc-700 text-white'
      }`}
    >
      {children}
    </button>
  );
}
