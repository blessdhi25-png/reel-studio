import { drawWatermark } from './watermark';

// Client-side "download with watermark": plays the source video into an
// offscreen <video>, repaints every frame onto a canvas with the ClipPulse
// mark on top, and records that canvas (+ the video's audio) with
// MediaRecorder. This runs in REAL TIME — a 30s clip takes ~30s — because
// MediaRecorder can only capture a live stream.
//
// Requirements / limits (all surface as WatermarkUnsupportedError so the
// caller can tell the user honestly instead of handing out an unmarked copy):
//  - the video host must send CORS headers (otherwise the canvas is tainted)
//  - plain MP4/WebM sources only (HLS .m3u8 can't be re-encoded this way)
//  - the tab should stay in the foreground (rAF/frame callbacks throttle
//    when hidden, which would stall the recording)
export class WatermarkUnsupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WatermarkUnsupportedError';
  }
}

function pickMimeType() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t));
}

const MAX_LONG_SIDE = 1920;

export async function downloadWithWatermark({ url, username, baseName = 'clippulse', signal, onProgress }) {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
    throw new WatermarkUnsupportedError("This browser can't record video, so the watermark can't be added.");
  }
  if (/\.m3u8(\?|$)/i.test(url)) {
    throw new WatermarkUnsupportedError("Streamed (HLS) videos can't be watermarked in the browser.");
  }
  const mimeType = pickMimeType();
  if (!mimeType) {
    throw new WatermarkUnsupportedError('No supported recording format in this browser.');
  }

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  let audioCtx;
  let canvasStream;
  let recorder;
  let rafId;
  const cleanup = () => {
    if (rafId) cancelAnimationFrame(rafId);
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch {}
    try { canvasStream?.getTracks().forEach((t) => t.stop()); } catch {}
    try { audioCtx?.close(); } catch {}
  };

  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () =>
        reject(new WatermarkUnsupportedError("The video couldn't be loaded for processing (the host may block cross-origin access)."));
    });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new WatermarkUnsupportedError("This video's length isn't known, so it can't be processed.");
    }

    // Size the canvas to the source (capped), keeping dimensions even.
    const scale = Math.min(1, MAX_LONG_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2);
    const h = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    canvasStream = canvas.captureStream(30);
    const tracks = [...canvasStream.getVideoTracks()];

    // Route the element's audio into a MediaStream destination only (not to
    // the speakers) so the user doesn't hear the clip while it's processed.
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      const src = audioCtx.createMediaElementSource(video);
      const dest = audioCtx.createMediaStreamDestination();
      src.connect(dest);
      tracks.push(...dest.stream.getAudioTracks());
    } catch {
      // No audio capture available — still produce a (silent) watermarked file.
    }

    recorder = new MediaRecorder(new MediaStream(tracks), { mimeType });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));

    const paint = () => {
      ctx.drawImage(video, 0, 0, w, h);
      drawWatermark(ctx, username, w, h);
      onProgress?.(Math.min(1, video.currentTime / duration));
    };
    const loop = () => {
      paint();
      if (video.ended) return;
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(loop);
      else rafId = requestAnimationFrame(loop);
    };

    const aborted = new Promise((_, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
    const ended = new Promise((resolve) => (video.onended = resolve));

    paint();
    recorder.start(1000);
    await video.play();
    loop();

    await Promise.race([ended, aborted]);
    paint();
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;

    const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
    const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
    const a = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    a.href = objectUrl;
    a.download = `${baseName}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  } catch (err) {
    try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch {}
    // A canvas tainted by a non-CORS source throws SecurityError on captureStream/draw.
    if (err?.name === 'SecurityError') {
      throw new WatermarkUnsupportedError("The video host doesn't allow cross-origin processing.");
    }
    throw err;
  } finally {
    cleanup();
  }
}
