'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useCameraDevices } from '../lib/useCameraDevices';
import CameraDeviceSelect from './CameraDeviceSelect';
import { drawWatermark } from '../lib/watermark';
import {
  computeDrawRect,
  createBeautyRenderer,
  disposePreviewRenderer,
  drawLensPreview,
} from '../lib/beautyRenderer';
import { DEFAULT_FILTER_ID, getFilter, opsToCss, resolveLook } from '../lib/cameraFilters';
import { describeCameraError, openCameraStream } from '../lib/cameraStream';

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

// 2D-canvas version of the look, used only when WebGL isn't available (or
// its context is lost): CSS filter + a radial vignette. No skin smoothing.
function drawBase2D(ctx, video, r, w, h, mirror, look) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.filter = look.css || 'none';
  ctx.drawImage(video, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
  ctx.restore();
  ctx.filter = 'none';
  if (look.vignette > 0) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${look.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

// Effects, text and watermark. Used both by the recording compositor (where
// they're baked into the file) and by the lightweight preview overlay.
function paintOverlays(ctx, kind, textOverlay, username, w, h, particles, frame) {
  const next = drawEffectFrame(ctx, kind, w, h, particles, frame);
  drawTextOverlay(ctx, textOverlay, w, h);
  drawWatermark(ctx, username, w, h);
  return next;
}

function CameraOffIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 2l20 20" />
      <path d="M7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-1" />
      <path d="M10.5 5H15a2 2 0 0 1 2 2v3.5l5-3v9" />
    </svg>
  );
}

// Shown in place of the preview when the camera can't start. The button is a
// real user gesture, which some browsers need before they'll re-prompt.
function CameraAccessOverlay({ info, onRetry }) {
  const canRetry = ['denied', 'busy', 'unknown'].includes(info.kind);
  return (
    <div role="alert" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-8 text-center bg-black">
      <span className="w-14 h-14 rounded-full bg-neutral-800 text-white flex items-center justify-center">
        <CameraOffIcon />
      </span>
      <p className="text-white font-bold text-lg">{info.message}</p>
      <p className="text-neutral-400 text-sm max-w-xs">{info.hint}</p>
      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm px-6 py-3 rounded-full active:scale-95 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Enable Camera Access
        </button>
      )}
    </div>
  );
}

const CameraRecorder = forwardRef(function CameraRecorder(
  {
    onCaptured,
    onCancel,
    embedded = false,
    // `lens` is an id from lib/cameraFilters.js; `retouch` turns skin
    // smoothing on. Beautify is the default look.
    //
    // Two paths, deliberately:
    //   - Framing the shot: the camera <video> is shown directly with a CSS
    //     filter (GPU-composited, no per-frame JS). That's the lens's colour
    //     look only — CSS can't do edge-preserving skin smoothing.
    //   - Recording: frames go through the WebGL pass (smoothing + look) onto
    //     a canvas, and MediaRecorder captures that canvas, so the saved file
    //     has everything baked in. The WebGL pass only runs while recording.
    lens = DEFAULT_FILTER_ID,
    retouch = true,
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
  const [errorInfo, setErrorInfo] = useState(null);
  const [starting, setStarting] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [micUnavailable, setMicUnavailable] = useState(false);
  // True once the recording canvas is actually showing frames; until then the
  // plain <video> stays on screen so there's never a blank flash.
  const [canvasLive, setCanvasLive] = useState(false);
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
      disposePreviewRenderer();
    };
  }, []);

  // --- Camera start-up -------------------------------------------------------
  // openCameraStream walks a fallback chain (chosen device -> 1280x720 with
  // mic -> without mic -> anything) so a blocked mic or an over-strict
  // constraint never costs the person their camera. See lib/cameraStream.js.
  useEffect(() => {
    if (!ready) return undefined; // wait for device enumeration before opening the real preview stream
    let cancelled = false;

    async function start() {
      setError(null);
      setErrorInfo(null);
      setMicUnavailable(false);
      setStarting(true);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        // Default to the exact selected device (the built-in camera, unless
        // the person picked something else) so load never silently hands
        // control to a connected phone/virtual camera. The front/back flip
        // button is the one deliberate exception: once used, facingMode
        // takes over until a device is explicitly picked again.
        const { stream, audio } = await openCameraStream({
          deviceId: !manualFacingFlip ? selectedDeviceId : '',
          facingMode,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setMicUnavailable(!audio);
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.play?.().catch(() => {});
        }
      } catch (err) {
        if (cancelled) return;
        console.warn('[CameraRecorder] camera unavailable:', err?.name, err?.message);
        const info = describeCameraError(err);
        setErrorInfo(info);
        setError(info.message);
      } finally {
        if (!cancelled) setStarting(false);
      }
    }

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      clearInterval(timerRef.current);
    };
  }, [facingMode, manualFacingFlip, selectedDeviceId, ready, retryKey]);

  // If the stream arrived while the <video> wasn't mounted yet (it is
  // unmounted behind the error overlay), attach it once it is.
  useEffect(() => {
    const v = videoRef.current;
    const stream = streamRef.current;
    if (v && stream && v.srcObject !== stream) {
      v.srcObject = stream;
      v.play?.().catch(() => {});
    }
  }, [error, starting, ready]);

  // Values the render loops read each frame. They live in refs rather than
  // effect dependencies: a dependency would tear the loop down and restart it
  // (resetting particles and the GL context) on every text drag or keystroke.
  const lensRef = useRef(lens);
  const retouchRef = useRef(retouch);
  const facingRef = useRef(facingMode);
  const recordingRef = useRef(false);
  const effectKindRef = useRef(effectKind);
  const textOverlayRef = useRef(textOverlay);
  const aspectFitRef = useRef(aspectFit);
  const usernameRef = useRef('');
  const compositorRef = useRef(null);
  const overlayRef = useRef(null);
  const overlayPaintRef = useRef(null);
  useEffect(() => {
    try {
      const me = JSON.parse(localStorage.getItem('user') || 'null');
      usernameRef.current = me?.username || '';
    } catch {
      usernameRef.current = '';
    }
  }, []);
  useEffect(() => {
    lensRef.current = lens;
  }, [lens]);
  useEffect(() => {
    retouchRef.current = retouch;
  }, [retouch]);
  useEffect(() => {
    facingRef.current = facingMode;
  }, [facingMode]);
  useEffect(() => {
    recordingRef.current = recording;
    if (!recording) compositorRef.current?.deactivate();
  }, [recording]);
  useEffect(() => {
    effectKindRef.current = effectKind;
  }, [effectKind]);
  useEffect(() => {
    textOverlayRef.current = textOverlay;
  }, [textOverlay]);
  useEffect(() => {
    aspectFitRef.current = aspectFit;
  }, [aspectFit]);

  // --- Recording compositor -------------------------------------------------
  // Set up once the camera is ready but idle: it draws nothing until
  // startRecording() activates it, so framing a shot costs no per-frame JS or
  // GPU work. While active, per frame: camera frame -> WebGL pass (skin
  // smoothing + colour look, lib/beautyRenderer.js) -> this 2D canvas, then
  // effects/text/watermark on top. MediaRecorder captures this canvas, which
  // is why every filter ends up in the saved file.
  useEffect(() => {
    if (!ready || error) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    // Opaque canvas lets the browser skip alpha compositing.
    const ctx = canvas.getContext('2d', { alpha: false });
    let renderer = createBeautyRenderer(); // null => plain 2D fallback

    // Sized from the canvas's own box (it fills the stage). Even dimensions
    // keep H.264/VP9 encoders happy.
    let w = 0;
    let h = 0;
    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      const nw = Math.max(2, Math.round(rect.width) & ~1);
      const nh = Math.max(2, Math.round(rect.height) & ~1);
      if (nw === w && nh === h) return;
      w = nw;
      h = nh;
      canvas.width = w;
      canvas.height = h;
      renderer?.resize(w, h);
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(canvas);

    let particles = [];
    let lastEffectKind = null;
    let frame = 0;

    // Texture uploads are the expensive part on phones, and the camera
    // delivers ~30 frames/s while rAF runs at 60, so only re-upload when the
    // video advanced. The 40ms floor covers browsers that don't update
    // currentTime reliably for live streams.
    let lastVideoTime = -1;
    let lastUploadAt = 0;

    // If frames are consistently slow, step the shader down (17-tap -> 9-tap
    // -> colour only) rather than let the recording stutter. Never steps back
    // up. Measured from rAF spacing, so a 30Hz-throttled display (e.g. iOS Low
    // Power Mode) steps down too.
    let quality = 2;
    let lastTs = 0;
    let slowAcc = 0;
    let slowFrames = 0;
    let warmup = 90;

    let look = null;
    let lookKey = '';

    // Black-frame safety net. Some GPU/driver combinations accept the WebGL
    // pass but hand back black frames. Early in a recording we sample the
    // canvas; if it is black while the camera feed is not, WebGL is switched
    // off for good and the 2D path takes over, instead of recording black.
    let glFrames = 0;
    let probe = null;
    const meanBrightness = (src) => {
      if (!probe) {
        const c = document.createElement('canvas');
        c.width = 8;
        c.height = 8;
        probe = c.getContext('2d', { willReadFrequently: true });
      }
      probe.drawImage(src, 0, 0, 8, 8);
      const d = probe.getImageData(0, 0, 8, 8).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
      return sum / ((d.length / 4) * 3);
    };

    function draw(now) {
      if (renderer && lastTs && now - lastTs < 100 && document.visibilityState === 'visible') {
        if (warmup > 0) {
          warmup -= 1;
        } else {
          slowAcc += now - lastTs;
          slowFrames += 1;
          if (slowFrames >= 60) {
            if (slowAcc / slowFrames > 26 && quality > 0) quality -= 1;
            slowAcc = 0;
            slowFrames = 0;
          }
        }
      }
      lastTs = now;

      const video = videoRef.current;
      if (!video || video.readyState < 2 || w <= 2) return false;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return false;

      const lensDef = getFilter(lensRef.current);
      const retouchOn = !!retouchRef.current;
      const key = `${lensDef.id}|${retouchOn}|${h}|${quality}`;
      if (key !== lookKey) {
        look = resolveLook(lensDef, { retouch: retouchOn, height: h, quality });
        lookKey = key;
      }

      const mirror = facingRef.current === 'user';
      const r = computeDrawRect(vw, vh, w, h, aspectFitRef.current);

      const t = video.currentTime;
      const upload = t !== lastVideoTime || now - lastUploadAt > 40;
      if (upload) {
        lastVideoTime = t;
        lastUploadAt = now;
      }

      // 1. Base camera frame: mirrored (selfie view), smoothed and graded.
      let drewBase = false;
      if (renderer && renderer.ready) {
        drewBase = renderer.render(video, vw, vh, r, look, { mirror, upload, time: (now / 1000) % 1000 });
        if (drewBase) {
          ctx.drawImage(renderer.canvas, 0, 0, w, h);
          glFrames += 1;
          if (glFrames === 20 || glFrames === 50 || glFrames === 80) {
            try {
              if (meanBrightness(canvas) < 2 && meanBrightness(video) > 8) {
                console.warn('[CameraRecorder] WebGL produced black frames; falling back to 2D.');
                renderer.dispose();
                renderer = null;
                drewBase = false;
              }
            } catch {
              /* probe is best-effort */
            }
          }
        }
      }
      if (!drewBase) drawBase2D(ctx, video, r, w, h, mirror, look);

      // 2. Effects, text, watermark — drawn in screen space on top.
      const currentKind = effectKindRef.current;
      if (currentKind !== lastEffectKind) {
        particles = []; // switching effects shouldn't carry over stale particles
        lastEffectKind = currentKind;
      }
      particles = paintOverlays(ctx, currentKind, textOverlayRef.current, usernameRef.current, w, h, particles, frame);
      frame += 1;
      return true;
    }

    let rafId = 0;
    let active = false;
    let shown = false;
    function loop(now) {
      rafId = requestAnimationFrame(loop);
      if (draw(now) && !shown) {
        shown = true;
        setCanvasLive(true);
      }
    }

    compositorRef.current = {
      activate() {
        if (active) return;
        active = true;
        shown = false;
        lastTs = 0;
        rafId = requestAnimationFrame(loop);
      },
      deactivate() {
        if (!active) return;
        active = false;
        cancelAnimationFrame(rafId);
        rafId = 0;
        shown = false;
        setCanvasLive(false);
      },
      // Draws one frame immediately, so the canvas has content before
      // captureStream() is called on it.
      drawNow() {
        measure();
        return draw(performance.now());
      },
    };

    return () => {
      compositorRef.current = null;
      active = false;
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      renderer?.dispose();
    };
  }, [ready, error]);

  // --- Preview overlay --------------------------------------------------------
  // While framing a shot the camera is the plain <video> (CSS filter). Effects,
  // text and the watermark are drawn on a transparent canvas above it, so none
  // of the video pixels pass through JavaScript. It animates only while an
  // effect is active; otherwise it paints once per change. Hidden while
  // recording (the recording canvas has all of this baked in already).
  const animatedOverlay = effectKind !== 'none';
  useEffect(() => {
    if (!ready || error) return undefined;
    const overlay = overlayRef.current;
    if (!overlay) return undefined;
    const octx = overlay.getContext('2d');

    let w = 0;
    let h = 0;
    let rafId = 0;
    let particles = [];
    let frame = 0;
    let lastKind = null;

    const paint = () => {
      if (!w || !h) return;
      octx.clearRect(0, 0, w, h);
      if (recordingRef.current) return;
      const kind = effectKindRef.current;
      if (kind !== lastKind) {
        particles = [];
        lastKind = kind;
      }
      particles = paintOverlays(octx, kind, textOverlayRef.current, usernameRef.current, w, h, particles, frame);
      frame += 1;
    };
    const measure = () => {
      const rect = overlay.getBoundingClientRect();
      const nw = Math.max(2, Math.round(rect.width));
      const nh = Math.max(2, Math.round(rect.height));
      if (nw !== w || nh !== h) {
        w = nw;
        h = nh;
        overlay.width = w;
        overlay.height = h;
      }
      paint();
    };
    overlayPaintRef.current = paint;
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(overlay);

    const loop = () => {
      rafId = requestAnimationFrame(loop);
      paint();
    };
    if (animatedOverlay && !recording) rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      overlayPaintRef.current = null;
    };
  }, [ready, error, animatedOverlay, recording]);

  // Repaint (without animating) when text or the effect changes.
  useEffect(() => {
    overlayPaintRef.current?.();
  }, [textOverlay, effectKind, recording]);

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
    // Switch the compositor on and draw a frame first, so the canvas has
    // content (and a size) by the time it's captured.
    compositorRef.current?.activate();
    compositorRef.current?.drawNow();
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
      compositorRef.current?.deactivate();
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

    // A plain counter rather than doing this inside a setSecondsLeft updater:
    // updaters run during render and must be pure, so calling the parent's
    // callback (or stopRecording) from one triggers React's "update a
    // component while rendering another" warning, and runs twice in StrictMode.
    let left = duration;
    timerRef.current = setInterval(() => {
      left = left <= 1 ? 0 : left - 1;
      setSecondsLeft(left);
      onSecondsLeftChange?.(left);
      if (left === 0) stopRecording();
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
    // Draws one filter thumbnail onto a square <canvas> from the live camera
    // frame (or a sample portrait before the camera is up). Skipped while
    // recording so previews never compete with the recording for frame time.
    drawFilterPreview: (target, lensId) => {
      if (recordingRef.current || !target) return;
      drawLensPreview(target, lensId, {
        video: videoRef.current,
        mirror: facingRef.current === 'user',
        retouch: !!retouchRef.current,
        referenceHeight: canvasRef.current?.height || 640,
      });
    },
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

  const lensDef = getFilter(lens);
  const previewFilter = opsToCss(lensDef.ops) || 'none';
  const previewVignette = lensDef.vignette || 0;

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

      <div className={embedded ? 'relative flex-1 bg-black overflow-hidden' : 'relative flex-1 bg-black mx-4 rounded-sprocket overflow-hidden'}>
        {error ? (
          <CameraAccessOverlay
            info={errorInfo || describeCameraError(null)}
            onRetry={() => setRetryKey((k) => k + 1)}
          />
        ) : (
          <>
            {/* What you see while framing the shot: the camera itself, with
                the lens's colour look as a CSS filter. That runs on the
                compositor/GPU with no per-frame JavaScript. (CSS can't do
                edge-preserving skin smoothing, so Retouch shows up once
                recording starts and the WebGL canvas takes over.) Kept
                visible rather than display:none, since some engines
                throttle decoding of hidden video. */}
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`absolute inset-0 w-full h-full ${aspectFit === 'contain' ? 'object-contain' : 'object-cover'}`}
              style={{
                filter: previewFilter,
                transform: facingMode === 'user' ? 'scaleX(-1)' : undefined,
                willChange: 'transform, filter',
                opacity: canvasLive ? 0 : 1,
              }}
            />
            {!canvasLive && previewVignette > 0 && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,${previewVignette}) 100%)`,
                }}
              />
            )}
            {/* Recording canvas: only drawn to while recording; it's what
                MediaRecorder captures. */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 block w-full h-full pointer-events-none"
              style={{ opacity: canvasLive ? 1 : 0 }}
            />
            {/* Preview overlay: effects, text and watermark only. */}
            <canvas
              ref={overlayRef}
              className="absolute inset-0 block w-full h-full pointer-events-none"
              style={{ opacity: canvasLive ? 0 : 1 }}
            />
            {/* Selected background track — not display:none, same decode-
                throttling reason as the video above. loop covers a short
                track under a longer recording. crossOrigin is required for
                createMediaElementSource() to read actual samples from a
                cross-origin URL (Cloudinary); without it the audio graph
                silently produces zeros and the track never reaches the
                recording. */}
            <div className="absolute w-px h-px overflow-hidden opacity-0 pointer-events-none">
              <audio ref={bgAudioRef} loop crossOrigin="anonymous" />
            </div>
            {/* Invisible hit-target for dragging the text overlay — the
                overlay's actual pixels are drawn onto a canvas (and so end
                up in the recording); this just captures the drag gesture at
                the same on-screen position. */}
            {textOverlay?.content && onTextOverlayPointerDown && (
              <div
                onPointerDown={onTextOverlayPointerDown}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-32 h-10 cursor-grab active:cursor-grabbing touch-none"
                style={{ left: `${textOverlay.x}%`, top: `${textOverlay.y}%` }}
              />
            )}
            {starting && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-white/70 text-sm font-semibold">Starting camera…</p>
              </div>
            )}
            {micUnavailable && !starting && (
              <p className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/60 text-white/90 text-[11px] font-semibold px-3 py-1 rounded-full pointer-events-none">
                Mic unavailable. Recording without sound.
              </p>
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
