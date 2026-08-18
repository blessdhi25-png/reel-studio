'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useCameraDevices } from '../lib/useCameraDevices';
import CameraDeviceSelect from './CameraDeviceSelect';

const DURATIONS = [
  { label: '15s', seconds: 15 },
  { label: '60s', seconds: 60 },
];

const CameraRecorder = forwardRef(function CameraRecorder(
  {
    onCaptured,
    onCancel,
    embedded = false,
    videoStyle,
    overlayChildren,
    onRecordingChange,
    onSecondsLeftChange,
    onErrorChange,
    onRecordErrorChange,
    // When embedded AND this is true, none of CameraRecorder's own chrome
    // renders (flip button, device picker, duration pills, shutter) — the
    // parent owns 100% of the visual controls and drives everything through
    // the imperative handle below instead. Defaults false so every existing
    // embedded call site keeps working unchanged.
    hideOwnControls = false,
  },
  ref
) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const [facingMode, setFacingMode] = useState('user');
  const [duration, setDuration] = useState(60);
  const [recording, setRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(duration);
  const [error, setError] = useState(null);
  // Separate from `error` (camera/mic access failures, which hide the
  // preview entirely) because this can happen even though the camera
  // preview is working fine — only recording itself is unsupported. Keeping
  // the live preview visible while explaining the situation is friendlier
  // than blanking the screen over something the person can work around.
  const [recordError, setRecordError] = useState(null);
  // Starts false so the detected built-in camera (selectedDeviceId, from
  // the shared hook) wins by default on load. Only flips to true once the
  // person explicitly hits the front/back flip button — a mobile-only
  // affordance, since desktops don't have a front/back camera pair.
  const [manualFacingFlip, setManualFacingFlip] = useState(false);
  const { devices, selectedDeviceId, setSelectedDeviceId, builtInDeviceId, ready } = useCameraDevices();

  useEffect(() => {
    onErrorChange?.(error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);
  useEffect(() => {
    onRecordErrorChange?.(recordError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordError]);

  useEffect(() => {
    if (!ready) return; // wait for device enumeration before opening the real preview stream
    let cancelled = false;

    async function start() {
      setError(null);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        // Default to the exact selected device (the built-in camera,
        // unless the person picked something else from the dropdown) so
        // load never silently hands control to a connected phone/virtual
        // camera. The front/back flip button is the one deliberate
        // exception — once used, it takes over via facingMode until a
        // device is explicitly picked again.
        const constraints = {
          video:
            !manualFacingFlip && selectedDeviceId
              ? { deviceId: { exact: selectedDeviceId } }
              : { facingMode },
          audio: true,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        setError('Camera access was denied or is unavailable. You can upload a file instead.');
      }
    }

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      clearInterval(timerRef.current);
    };
  }, [facingMode, manualFacingFlip, selectedDeviceId, ready]);

  function flipCamera() {
    setManualFacingFlip(true); // hand control to the mobile front/back flip
    setFacingMode((m) => (m === 'user' ? 'environment' : 'user'));
  }

  function pickDevice(deviceId) {
    setManualFacingFlip(false); // hand control back to the explicit device pick
    setSelectedDeviceId(deviceId);
  }

  // iOS Safari has no WebM support at all — MediaRecorder.isTypeSupported
  // returns false for every video/webm variant there, and previously this
  // fell back to a hardcoded 'video/webm' anyway, which throws a synchronous
  // NotSupportedError the moment `new MediaRecorder(...)` runs. That
  // uncaught throw is what produced "broken/empty preview" specifically on
  // mobile — recording never actually started, but nothing surfaced a
  // message explaining why. This tries codecs in preference order and only
  // uses one MediaRecorder actually reports support for; Safari lands on
  // video/mp4, everything else lands on a webm variant.
  function pickSupportedMimeType() {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4;codecs=h264,aac',
      'video/mp4',
    ];
    return candidates.find((t) => MediaRecorder.isTypeSupported?.(t));
  }

  function startRecording() {
    if (!streamRef.current) return;
    chunksRef.current = [];

    const mimeType = pickSupportedMimeType();
    if (!mimeType) {
      setRecordError('Recording isn\u2019t supported in this browser. Please upload a video file instead.');
      return;
    }

    let recorder;
    try {
      recorder = new MediaRecorder(streamRef.current, { mimeType });
    } catch {
      setRecordError('Recording isn\u2019t supported in this browser. Please upload a video file instead.');
      return;
    }

    // Base type (codec params stripped) drives both the File's `type` and
    // its extension, so what actually gets recorded matches what's sent to
    // the backend — the fileFilter in backend/src/utils/upload.js only
    // accepts the exact strings 'video/mp4' / 'video/webm' / 'video/quicktime',
    // and the extension needs to match too since some players/servers infer
    // type from the filename. Hardcoding '.webm' regardless of the real
    // mimeType (the previous behavior) meant an mp4-encoded recording from
    // Safari would ship mislabeled as a .webm file.
    const baseType = mimeType.split(';')[0];
    const extension = baseType === 'video/mp4' ? 'mp4' : 'webm';

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: baseType });
      const file = new File([blob], `recording-${Date.now()}.${extension}`, { type: baseType });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onCaptured(file);
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    onRecordingChange?.(true);
    setSecondsLeft(duration);
    onSecondsLeftChange?.(duration);

    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        const next = s <= 1 ? 0 : s - 1;
        onSecondsLeftChange?.(next);
        if (s <= 1) {
          stopRecording();
        }
        return next;
      });
    }, 1000);
  }

  function stopRecording() {
    clearInterval(timerRef.current);
    setRecording(false);
    onRecordingChange?.(false);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }

  // Mic mute is a direct MediaStreamTrack toggle rather than a MediaRecorder
  // option — disabling the track sends silence without ending the track, so
  // recording (if already in progress) keeps running uninterrupted.
  function toggleMic() {
    const track = streamRef.current?.getAudioTracks?.()[0];
    if (!track) return null;
    track.enabled = !track.enabled;
    return track.enabled;
  }

  useImperativeHandle(ref, () => ({
    flipCamera,
    startRecording,
    stopRecording,
    toggleMic,
    setDurationSeconds: (seconds) => setDuration(seconds),
  }));

  const recordControls = (
    <>
      <div className="flex justify-center gap-2 mb-6">
        {DURATIONS.map((d) => (
          <button
            key={d.seconds}
            onClick={() => setDuration(d.seconds)}
            disabled={recording}
            className={`px-4 py-1 font-mono text-xs uppercase tracking-widest rounded-sprocket border disabled:opacity-40 ${
              duration === d.seconds ? 'border-reel text-reel' : 'border-smoke/40 text-smoke'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center">
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={!!error || !!recordError}
          className="w-16 h-16 rounded-full border-4 border-bone flex items-center justify-center disabled:opacity-30"
        >
          <span className={`bg-red-500 transition-all ${recording ? 'w-6 h-6 rounded-sprocket' : 'w-12 h-12 rounded-full'}`} />
        </button>
      </div>
      <p className="font-body text-smoke text-xs text-center mt-4">
        {recording ? 'Recording — tap to stop' : 'Tap to start recording'}
      </p>
    </>
  );

  return (
    <div className={embedded ? 'relative w-full h-full flex flex-col' : 'fixed inset-0 z-50 bg-ink flex flex-col'}>
      {!embedded && (
        <div className="flex items-center justify-between px-6 py-4">
          <button onClick={onCancel} className="text-bone text-2xl leading-none">✕</button>
          <div className="flex items-center gap-3">
            {devices.length > 1 && (
              <CameraDeviceSelect
                devices={devices}
                selectedDeviceId={selectedDeviceId}
                onChange={pickDevice}
                builtInDeviceId={builtInDeviceId}
                className="bg-ink2 border border-smoke/30 text-bone text-[11px] rounded-sprocket px-2 py-1.5 outline-none max-w-[160px]"
              />
            )}
            <button
              onClick={flipCamera}
              disabled={recording}
              className="text-bone text-xl disabled:opacity-30"
              aria-label="Flip camera"
            >
              ⟲
            </button>
          </div>
        </div>
      )}

      <div className={embedded ? 'relative flex-1 bg-ink2 overflow-hidden' : 'relative flex-1 bg-ink2 mx-4 rounded-sprocket overflow-hidden'}>
        {error ? (
          <div className="w-full h-full flex items-center justify-center px-8 text-center">
            <p className="font-body text-smoke text-sm">{error}</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={videoStyle}
            className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
          />
        )}

        {overlayChildren}

        {embedded && !hideOwnControls && devices.length > 1 && (
          <div className="absolute top-4 right-4">
            <CameraDeviceSelect
              devices={devices}
              selectedDeviceId={selectedDeviceId}
              onChange={pickDevice}
              builtInDeviceId={builtInDeviceId}
              className="bg-ink/70 border border-smoke/30 text-bone text-[11px] rounded-sprocket px-2 py-1.5 outline-none max-w-[160px]"
            />
          </div>
        )}
        {embedded && !hideOwnControls && (
          <button
            onClick={flipCamera}
            disabled={recording}
            className="absolute top-4 left-4 w-9 h-9 rounded-full bg-ink/70 text-bone text-lg flex items-center justify-center disabled:opacity-30"
            aria-label="Flip camera"
          >
            ⟲
          </button>
        )}

        {recording && !hideOwnControls && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-ink/70 px-3 py-1 rounded-sprocket">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="font-mono text-xs text-bone">{secondsLeft}s</span>
          </div>
        )}

        {recordError && !error && (
          <div className="absolute inset-x-0 bottom-0 bg-ink/85 px-4 py-3 text-center">
            <p className="font-body text-smoke text-xs">{recordError}</p>
          </div>
        )}

        {/* In embedded mode these controls float over the preview instead
            of taking real flex space below it, since the page embedding
            this (the camera-first studio view) stacks its own bottom
            mode-toggle bar at the very bottom of the same screen —
            positioned a bit higher (bottom-28) so the two don't overlap.
            Suppressed entirely when hideOwnControls is set — the parent is
            rendering its own shutter/duration UI and drives this component
            purely through the imperative ref instead. */}
        {embedded && !hideOwnControls && (
          <div className="absolute bottom-28 inset-x-0 px-6">
            {recordControls}
          </div>
        )}
      </div>

      {!embedded && <div className="px-6 py-6">{recordControls}</div>}
    </div>
  );
});

export default CameraRecorder;
