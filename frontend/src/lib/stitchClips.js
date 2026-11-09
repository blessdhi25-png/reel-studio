// Client-side clip stitching for multi-clip templates.
//
// The backend accepts exactly one video file per post (POST /videos, no concat
// step), so a template made of N clips is combined in the browser first: each
// clip is played in order through a hidden <video>, painted onto one 9:16
// canvas, and recorded with MediaRecorder. The result is a single File that
// flows through the normal single-file publish path.
//
// Trade-offs (inherent to this approach):
//  - It runs in REAL TIME: a 15 s template takes ~15 s to build.
//  - The tab must stay open and visible while it runs (browsers pause canvas
//    painting in background tabs).
//  - Clips are cropped to fill 9:16 ("cover"), and trimmed to `clipSeconds[i]`
//    when given (a clip shorter than that just plays to its end).
//  - Output is WebM (or MP4 where the browser records it), both accepted by the
//    upload filter; quality is ~4 Mbps at 720x1280.

const OUT_W = 720;
const OUT_H = 1280;
const FPS = 30;

function pickMimeType() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((t) => window.MediaRecorder?.isTypeSupported?.(t));
}

export function canStitchInBrowser() {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    !!pickMimeType()
  );
}

function drawCover(ctx, video) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.max(OUT_W / vw, OUT_H / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(video, (OUT_W - dw) / 2, (OUT_H - dh) / 2, dw, dh);
}

function abortError() {
  return Object.assign(new Error('Cancelled'), { name: 'AbortError' });
}

// files: File[] in playback order. clipSeconds: optional per-clip cap (seconds).
// onProgress({ index, count, elapsed, total }) where total may be 0 if unknown.
export async function stitchClips(files, { clipSeconds = [], onProgress, signal } = {}) {
  if (!files?.length) throw new Error('No clips to combine.');
  if (!canStitchInBrowser()) {
    throw new Error("This browser can't combine clips. Try Chrome, Edge or Safari 14.1+, or use a template with a single clip.");
  }
  const mimeType = pickMimeType();
  const baseType = mimeType.split(';')[0];
  const extension = baseType === 'video/mp4' ? 'mp4' : 'webm';

  const canvas = document.createElement('canvas');
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, OUT_W, OUT_H);

  const video = document.createElement('video');
  video.playsInline = true;
  video.preload = 'auto';
  video.muted = false;

  let audioCtx = null;
  let audioTrack = null;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      audioCtx = new AC();
      await audioCtx.resume().catch(() => {});
      const dest = audioCtx.createMediaStreamDestination();
      // Routed to the recording only (not the speakers), so nothing is heard while it builds.
      audioCtx.createMediaElementSource(video).connect(dest);
      audioTrack = dest.stream.getAudioTracks()[0] || null;
    }
  } catch {
    audioTrack = null; // degrade to a silent stitch rather than failing
  }

  const stream = canvas.captureStream(FPS);
  if (audioTrack) stream.addTrack(audioTrack);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
  const stopped = new Promise((resolve) => {
    recorder.onstop = resolve;
  });

  let raf = 0;
  const paint = () => {
    if (video.readyState >= 2) drawCover(ctx, video);
    raf = requestAnimationFrame(paint);
  };

  const planned = files.reduce((sum, _f, i) => sum + (clipSeconds[i] || 0), 0);
  let elapsedBefore = 0;
  let currentUrl = null;

  const cleanup = () => {
    cancelAnimationFrame(raf);
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    stream.getTracks().forEach((t) => t.stop());
    audioCtx?.close().catch(() => {});
  };

  try {
    recorder.start(250);
    raf = requestAnimationFrame(paint);

    for (let i = 0; i < files.length; i++) {
      if (signal?.aborted) throw abortError();
      currentUrl = URL.createObjectURL(files[i]);
      video.src = currentUrl;

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Clip ${i + 1} took too long to load.`)), 15000);
        video.onloadeddata = () => {
          clearTimeout(timer);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(new Error(`Couldn't read clip ${i + 1}. Is it a valid video file?`));
        };
      });

      const limit = clipSeconds[i] > 0 ? clipSeconds[i] : Infinity;
      await video.play();
      await new Promise((resolve, reject) => {
        const tick = setInterval(() => {
          if (signal?.aborted) {
            clearInterval(tick);
            reject(abortError());
            return;
          }
          onProgress?.({ index: i, count: files.length, elapsed: elapsedBefore + Math.min(video.currentTime, limit), total: planned });
          if (video.currentTime >= limit) {
            clearInterval(tick);
            resolve();
          }
        }, 100);
        video.onended = () => {
          clearInterval(tick);
          resolve();
        };
      });
      video.pause();
      elapsedBefore += Math.min(video.currentTime || 0, limit);
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    }

    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    const blob = new Blob(chunks, { type: baseType });
    if (!blob.size) throw new Error('Combining the clips produced an empty video. Please try again.');
    return new File([blob], `template-${Date.now()}.${extension}`, { type: baseType });
  } catch (err) {
    if (recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
    }
    throw err;
  } finally {
    cleanup();
  }
}
