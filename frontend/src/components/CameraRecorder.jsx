'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useCameraDevices } from '../lib/useCameraDevices';
import CameraDeviceSelect from './CameraDeviceSelect';

const DURATIONS = [
  { label: '15s', seconds: 15 },
  { label: '60s', seconds: 60 },
];

// Draws one frame of an animated overlay effect directly onto the
// compositor canvas (see the rAF loop below) — this is what makes an
// effect actually end up baked into the recorded pixels, as opposed to a
// separate DOM/canvas layer that only ever existed for on-screen display.
// Mutates and returns `particles` (the running particle-system state for
// whichever effect is active) rather than owning its own state, since it's
// called once per frame from inside the loop's closure.
function drawEffectFrame(ctx, kind, width, height, particles, frame) {
  if (!kind || kind === 'none') return particles;

  function spawn() {
    if (kind === 'hearts') {
      particles.push({
        x: Math.random() * width,
        y: height + 20,
        size: 14 + Math.random() * 14,
        speed: 0.6 + Math.random() * 1.2,
        drift: (Math.random() - 0.5) * 0.6,
        opacity: 1,
        rotation: (Math.random() - 0.5) * 0.6,
      });
    } else if (kind === 'sparkle') {
      particles.push({ x: Math.random() * width, y: Math.random() * height, size: 2 + Math.random() * 3, life: 0, maxLife: 40 + Math.random() * 40 });
    } else if (kind === 'snow') {
      particles.push({ x: Math.random() * width, y: -10, size: 2 + Math.random() * 4, speed: 0.5 + Math.random() * 1, drift: (Math.random() - 0.5) * 0.5 });
    }
  }

  if (kind === 'hearts') {
    if (frame % 12 === 0) spawn();
    particles = particles.filter((p) => p.opacity > 0);
    particles.forEach((p) => {
      p.y -= p.speed;
      p.x += p.drift;
      p.opacity -= 0.006;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.font = `${p.size}px sans-serif`;
      ctx.fillText('❤️', -p.size / 2, 0);
      ctx.restore();
    });
  } else if (kind === 'mesh') {
    const spacing = 32;
    const t = frame * 0.02;
    ctx.strokeStyle = 'rgba(34,211,238,0.35)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += spacing) {
      ctx.beginPath();
      for (let y = 0; y <= height; y += 8) {
        const offset = Math.sin(y * 0.02 + t) * 6;
        y === 0 ? ctx.moveTo(x + offset, y) : ctx.lineTo(x + offset, y);
      }
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += spacing) {
      ctx.beginPath();
      for (let x = 0; x <= width; x += 8) {
        const offset = Math.sin(x * 0.02 + t) * 6;
        x === 0 ? ctx.moveTo(x, y + offset) : ctx.lineTo(x, y + offset);
      }
      ctx.stroke();
    }
  } else if (kind === 'glow') {
    const pulse = (Math.sin(frame * 0.02) + 1) / 2;
    const grad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.6);
    grad.addColorStop(0, 'rgba(253,230,138,0)');
    grad.addColorStop(0.7, `rgba(253,230,138,${0.05 + pulse * 0.08})`);
    grad.addColorStop(1, `rgba(253,230,138,${0.15 + pulse * 0.15})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = `rgba(253,230,138,${0.3 + pulse * 0.3})`;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, width - 8, height - 8);
  } else if (kind === 'sparkle') {
    if (frame % 3 === 0) spawn();
    particles = particles.filter((p) => p.life < p.maxLife);
    particles.forEach((p) => {
      p.life += 1;
      const t = p.life / p.maxLife;
      const alpha = t < 0.5 ? t * 2 : (1 - t) * 2;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  } else if (kind === 'snow') {
    if (frame % 4 === 0) spawn();
    particles = particles.filter((p) => p.y < height + 20);
    particles.forEach((p) => {
      p.y += p.speed;
      p.x += p.drift;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
  return particles;
}

function drawTextOverlay(ctx, overlay, width, height) {
  if (!overlay?.content) return;
  const x = (overlay.x / 100) * width;
  const y = (overlay.y / 100) * height;
  ctx.save();
  ctx.filter = 'none'; // never tint overlay text with the base video's color-grading filter
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = Math.max(16, Math.round(width * 0.055));
  ctx.font = `700 ${fontSize}px "Bebas Neue", sans-serif`;
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#fff';
  const lines = overlay.content.split('\n');
  const lineHeight = fontSize * 1.15;
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineHeight));
  ctx.restore();
}

// cover: crop the source to fill the destination with no letterboxing.
// contain: letterbox/pillarbox to show the whole source.
function computeDrawRect(srcW, srcH, dstW, dstH, fit) {
  if (!srcW || !srcH) return { sx: 0, sy: 0, sw: dstW, sh: dstH, dx: 0, dy: 0, dw: dstW, dh: dstH };
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  if (fit === 'contain') {
    let w = dstW;
    let h = dstW / srcRatio;
    if (h > dstH) {
      h = dstH;
      w = dstH * srcRatio;
    }
    return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx: (dstW - w) / 2, dy: (dstH - h) / 2, dw: w, dh: h };
  }
  let sw = srcW;
  let sh = srcH;
  let sx = 0;
  let sy = 0;
  if (srcRatio > dstRatio) {
    sw = srcH * dstRatio;
    sx = (srcW - sw) / 2;
  } else {
    sh = srcW / dstRatio;
    sy = (srcH - sh) / 2;
  }
  return { sx, sy, sw, sh, dx: 0, dy: 0, dw: dstW, dh: dstH };
}

const CameraRecorder = forwardRef(function CameraRecorder(
  {
    onCaptured,
    onCancel,
    embedded = false,
    // Baked into every recorded frame via the canvas compositor below —
    // NOT applied as CSS to a <video> element, which would only affect
    // on-screen display and never end up in the actual recorded pixels.
    filterCss,
    aspectFit = 'cover',
    effectKind = 'none',
    textOverlay,
    onTextOverlayPointerDown,
    onRecordingChange,
    onSecondsLeftChange,
    onErrorChange,
    onRecordErrorChange,
    // Selected background track's audioUrl, or null. Played in sync with
    // recording start/stop and mixed into the recorded audio track via Web
    // Audio API — see startRecording below.
    backgroundAudioUrl = null,
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
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const bgAudioRef = useRef(null);
  // Lazily created once and reused across multiple record/discard/re-record
  // cycles within the same mount — createMediaElementSource can only ever
  // be called once per <audio> element for its whole lifetime (a Web Audio
  // API constraint, not a bug), so this must not be recreated on every
  // startRecording() call.
  const audioCtxRef = useRef(null);
  const micSourceNodeRef = useRef(null);
  const musicSourceNodeRef = useRef(null);
  const destinationNodeRef = useRef(null);

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
    const el = bgAudioRef.current;
    if (!el) return;
    if (!backgroundAudioUrl) {
      el.pause();
      el.removeAttribute('src');
      return;
    }
    if (el.src !== backgroundAudioUrl) {
      el.src = backgroundAudioUrl;
    }
  }, [backgroundAudioUrl]);

  // AudioContext instances are a limited, non-trivially-garbage-collected
  // browser resource — closing it on unmount (not just on stopRecording)
  // avoids leaking one every time this component mounts/unmounts, e.g. the
  // Templates hub round-trip or navigating away mid-session.
  useEffect(() => {
    return () => {
      bgAudioRef.current?.pause();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

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

  // --- Canvas compositor: the single source of truth for both what's
  // displayed AND what gets recorded (see startRecording below, which
  // captures a stream directly off this canvas). Frequently-changing
  // cosmetic props (filter/effect/text) are read from refs each frame
  // instead of being effect dependencies — putting them in the dependency
  // array would tear down and restart the whole loop (resetting particle
  // animation state) on every keystroke of a text overlay or every drag
  // move, instead of just picking up the new value on the next frame. ---
  const filterCssRef = useRef(filterCss);
  const effectKindRef = useRef(effectKind);
  const textOverlayRef = useRef(textOverlay);
  const aspectFitRef = useRef(aspectFit);
  useEffect(() => {
    filterCssRef.current = filterCss;
  }, [filterCss]);
  useEffect(() => {
    effectKindRef.current = effectKind;
  }, [effectKind]);
  useEffect(() => {
    textOverlayRef.current = textOverlay;
  }, [textOverlay]);
  useEffect(() => {
    aspectFitRef.current = aspectFit;
  }, [aspectFit]);

  useEffect(() => {
    if (!ready || error) return;
    let rafId;
    let particles = [];
    let lastEffectKind = null;
    let frame = 0;

    function tick() {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video && video.readyState >= 2 && canvas.parentElement) {
        const rect = canvas.parentElement.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
          canvas.width = rect.width;
          canvas.height = rect.height;
        }
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // 1. Base camera frame — mirrored (selfie view) and filtered.
        ctx.save();
        if (facingMode === 'user') {
          ctx.translate(w, 0);
          ctx.scale(-1, 1);
        }
        ctx.filter = filterCssRef.current || 'none';
        const r = computeDrawRect(video.videoWidth, video.videoHeight, w, h, aspectFitRef.current);
        ctx.drawImage(video, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
        ctx.restore();

        // 2. Animated effect layer — never mirrored/filtered, drawn in
        // normal screen space on top of the (already mirrored) frame.
        const currentKind = effectKindRef.current;
        if (currentKind !== lastEffectKind) {
          particles = []; // switching effects shouldn't carry over stale particles from the last one
          lastEffectKind = currentKind;
        }
        ctx.filter = 'none';
        particles = drawEffectFrame(ctx, currentKind, w, h, particles, frame);

        // 3. Text overlay, topmost.
        drawTextOverlay(ctx, textOverlayRef.current, w, h);

        frame += 1;
      }
      rafId = requestAnimationFrame(tick);
    }

    tick();
    return () => cancelAnimationFrame(rafId);
  }, [ready, error, facingMode]);

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

  function ensureAudioContext() {
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AC();
    }
    if (audioCtxRef.current.state === 'suspended') {
      // Fire-and-forget — browsers require resume() to trace back to a
      // user gesture, which primeAudio() (exposed below) guarantees by
      // being called synchronously from the shutter tap itself, even when
      // a pre-record countdown delays the actual startRecording() call.
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }

  function startRecording() {
    if (!streamRef.current || !canvasRef.current) return;
    chunksRef.current = [];

    const mimeType = pickSupportedMimeType();
    if (!mimeType) {
      setRecordError('Recording isn\u2019t supported in this browser. Please upload a video file instead.');
      return;
    }

    // The actual fix: record a stream captured off the *canvas* (which has
    // the filter/effect/text already composited into every frame it
    // draws) instead of the raw camera MediaStream. Audio still comes
    // straight from the mic track — canvas.captureStream() only produces
    // video.
    const canvasStream = canvasRef.current.captureStream(30);
    const audioTrack = streamRef.current.getAudioTracks()[0];
    let audioTracksForRecording = audioTrack ? [audioTrack] : [];

    if (backgroundAudioUrl && bgAudioRef.current) {
      // Mixes mic + the selected background track into one recorded audio
      // track via a small Web Audio graph, instead of just recording
      // whichever one happens to be louder in the room. Wrapped in a
      // try/catch that degrades to mic-only audio (never fails the whole
      // recording) — Web Audio can be blocked entirely in some embedded/
      // locked-down browser contexts.
      try {
        const audioCtx = ensureAudioContext();
        if (audioCtx) {
          if (!destinationNodeRef.current) {
            destinationNodeRef.current = audioCtx.createMediaStreamDestination();
          }
          // Mic → recording only, never audioCtx.destination — routing the
          // user's own mic to their speakers would cause live feedback/echo.
          if (!micSourceNodeRef.current && audioTrack) {
            micSourceNodeRef.current = audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
            micSourceNodeRef.current.connect(destinationNodeRef.current);
          }
          // Background track → both the recording AND real speaker output,
          // so it's audible live (matches requirement #2) as well as
          // captured (#3). createMediaElementSource permanently reroutes
          // this element's output through the graph from here on — see the
          // audioCtxRef comment above on why it's created/connected once
          // and reused, not recreated per recording.
          if (!musicSourceNodeRef.current) {
            musicSourceNodeRef.current = audioCtx.createMediaElementSource(bgAudioRef.current);
            musicSourceNodeRef.current.connect(destinationNodeRef.current);
            musicSourceNodeRef.current.connect(audioCtx.destination);
          }
          audioTracksForRecording = destinationNodeRef.current.stream.getAudioTracks();
        }
      } catch (err) {
        console.error('[CameraRecorder] background audio mixing failed, recording mic-only:', err);
      }

      bgAudioRef.current.currentTime = 0;
      bgAudioRef.current.play().catch(() => {});
    }

    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioTracksForRecording,
    ]);

    let recorder;
    try {
      recorder = new MediaRecorder(combinedStream, { mimeType });
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
      canvasStream.getTracks().forEach((t) => t.stop());
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
    bgAudioRef.current?.pause();
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
    // Called synchronously from the shutter tap itself (before any
    // pre-record countdown delay) so AudioContext creation/resume traces
    // back to a real user gesture — autoplay policies in some browsers
    // (Safari in particular) can otherwise block resume() if it only ever
    // happens inside a later setTimeout callback. No-op when there's no
    // background track selected, so tapping the shutter stays just as fast
    // as before when there's nothing to mix.
    primeAudio: () => {
      if (backgroundAudioUrl) ensureAudioContext();
    },
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
          <>
            {/* Real source of truth for pixels, kept truly visible (not
                display:none) rather than just invisible — some engines
                throttle frame decoding on fully display:none video, which
                would starve the canvas compositor of fresh frames. 1x1 and
                clipped is enough to avoid any layout footprint. */}
            <div className="absolute w-px h-px overflow-hidden opacity-0 pointer-events-none">
              <video ref={videoRef} autoPlay muted playsInline />
              {/* Selected background track — not display:none for the same
                  frame-throttling reason as the video above, though audio
                  playback is far less sensitive to it than video decode is.
                  loop covers a short track under a longer recording. */}
              {/* crossOrigin is required for createMediaElementSource() to
                  read actual audio samples from a cross-origin URL
                  (Cloudinary). Without it, the browser doesn't throw or
                  error — the resulting audio graph node just silently
                  produces zeros, so the mixing code above runs successfully
                  and the recording completes, but the background track
                  never actually makes it into the recorded audio. Cloudinary
                  serves delivered assets with Access-Control-Allow-Origin: *
                  by default, so this is safe to request. */}
              <audio ref={bgAudioRef} loop crossOrigin="anonymous" />
            </div>
            <canvas ref={canvasRef} className="block w-full h-full pointer-events-none" />
            {/* Invisible hit-target for dragging the text overlay — the
                overlay's actual pixels are drawn onto the canvas above (and
                therefore end up in the recording), this just captures the
                drag gesture at the same on-screen position. */}
            {textOverlay?.content && onTextOverlayPointerDown && (
              <div
                onPointerDown={onTextOverlayPointerDown}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-32 h-10 cursor-grab active:cursor-grabbing touch-none"
                style={{ left: `${textOverlay.x}%`, top: `${textOverlay.y}%` }}
              />
            )}
          </>
        )}

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
