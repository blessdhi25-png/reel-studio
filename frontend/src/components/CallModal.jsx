'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';

// Full-screen calling UI for the DM screen.
//
// NOTE: there is no call-signaling backend yet, so nothing actually rings the other person.
// This drives the UI state (Ringing… -> Connected + timer) and uses the REAL local mic/camera:
// the mute and camera buttons toggle the live tracks, and a video call shows your own preview.
// Replace SIMULATED_RING_MS handling with a real accept event when signaling exists.
const SIMULATED_RING_MS = 3000;

function formatDuration(s) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function CallModal({ user, callType, onEnd }) {
  const [status, setStatus] = useState('ringing'); // ringing | connected
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(callType === 'video');
  const [localStream, setLocalStream] = useState(null);
  const [mediaError, setMediaError] = useState(null);
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const isVideo = callType === 'video';

  // Local mic (+ camera for video calls).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMediaError('Microphone is not available in this browser.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setLocalStream(stream);
      } catch (err) {
        if (!cancelled) {
          setMediaError(
            err?.name === 'NotAllowedError'
              ? `Allow ${isVideo ? 'camera and ' : ''}microphone access to use calls.`
              : err?.name === 'NotReadableError'
              ? 'Your mic or camera is in use by another app.'
              : 'Could not access your mic or camera.'
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [isVideo]);

  useEffect(() => {
    const el = videoRef.current;
    if (el && localStream) {
      el.srcObject = localStream;
      el.play?.().catch(() => {});
    }
  }, [localStream, cameraOn]);

  // Ringing -> connected (simulated, see note above), then a duration timer.
  useEffect(() => {
    const t = setTimeout(() => setStatus('connected'), SIMULATED_RING_MS);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (status !== 'connected') return undefined;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  function toggleMute() {
    const track = streamRef.current?.getAudioTracks()[0];
    if (track) track.enabled = muted; // currently muted -> enable
    setMuted((m) => !m);
  }

  function toggleCamera() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) track.enabled = !cameraOn;
    setCameraOn((c) => !c);
  }

  const statusText = status === 'ringing' ? 'Ringing…' : `Connected · ${formatDuration(seconds)}`;

  return (
    <div className="fixed inset-0 z-[90] bg-zinc-950 text-white flex flex-col" role="dialog" aria-label={`${isVideo ? 'Video' : 'Voice'} call`}>
      {/* Remote area: no remote stream yet, so the other person's avatar fills it. */}
      <div className="flex-1 relative flex flex-col items-center justify-center gap-4 px-6 bg-gradient-to-b from-zinc-900 to-zinc-950">
        <span className={`relative w-32 h-32 rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center text-4xl font-bold text-amber-400 ${status === 'ringing' ? 'ring-4 ring-amber-500/40 animate-pulse' : 'ring-4 ring-emerald-500/40'}`}>
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            user?.username?.[0]?.toUpperCase() || '?'
          )}
        </span>
        <div className="text-center">
          <p className="font-extrabold text-xl">@{user?.username || '…'}</p>
          <p className={`text-sm font-semibold mt-1 ${status === 'connected' ? 'text-emerald-400' : 'text-zinc-400'}`}>
            {isVideo && status === 'ringing' ? 'Video calling… ' : ''}
            {statusText}
          </p>
        </div>
        {mediaError && (
          <p className="max-w-xs text-center text-xs font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
            {mediaError}
          </p>
        )}

        {/* Own camera preview */}
        {isVideo && (
          <div className="absolute top-4 right-4 w-28 sm:w-36 aspect-[3/4] rounded-2xl overflow-hidden bg-zinc-800 border border-zinc-700 shadow-2xl">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-cover scale-x-[-1] ${cameraOn && localStream ? '' : 'invisible'}`}
            />
            {(!cameraOn || !localStream) && (
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
          <RoundButton onClick={toggleCamera} active={!cameraOn} label={cameraOn ? 'Turn camera off' : 'Turn camera on'}>
            {cameraOn ? <Video size={22} /> : <VideoOff size={22} />}
          </RoundButton>
        )}
        <RoundButton onClick={() => setSpeakerOn((v) => !v)} active={!speakerOn} label={speakerOn ? 'Speaker on' : 'Speaker off'}>
          {speakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
        </RoundButton>
        <button
          onClick={onEnd}
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
