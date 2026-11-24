import { api } from './api';
import { CONNECTION_LOST } from './friendlyError';

// Direct-to-storage uploads for artist tracks: the browser gets a short-lived signature from our API, then
// sends the file straight to the storage provider (Cloudinary). Nothing large passes through the API server,
// so there's no request-body limit or server timeout to hit. Failures reject with a human sentence.
const GENERIC = 'Something went wrong. Please try again.';

const MAX = { audio: 50 * 1024 * 1024, cover: 5 * 1024 * 1024 };
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|mp4|ogg|webm)$/i;
const COVER_EXT = /\.(jpe?g|png|webp)$/i;

export function checkFile(kind, file) {
  if (!file) return 'Choose a file first.';
  if (kind === 'audio' && !AUDIO_EXT.test(file.name) && !file.type.startsWith('audio/')) return 'Use an MP3, WAV, M4A or AAC file.';
  if (kind === 'cover' && !COVER_EXT.test(file.name) && !/^image\/(jpeg|png|webp)$/.test(file.type)) return 'Cover art must be a JPG, PNG or WEBP image.';
  if (file.size > MAX[kind]) return `That file is too large (max ${MAX[kind] / 1024 / 1024}MB).`;
  return null;
}

/** Uploads one file and resolves with its public URL. onProgress receives 0–100. */
export async function uploadToStorage(kind, file, onProgress, signal) {
  const problem = checkFile(kind, file);
  if (problem) throw new Error(problem);

  let sig;
  try {
    sig = await api.getUploadSignature(kind);
  } catch (err) {
    throw new Error(err?.status === 404 ? 'Register as an artist first.' : err?.status === 503 ? GENERIC : err?.message === CONNECTION_LOST ? CONNECTION_LOST : GENERIC);
  }

  return new Promise((resolve, reject) => {
    const form = new FormData();
    Object.entries(sig.params).forEach(([k, v]) => form.append(k, String(v)));
    form.append('api_key', sig.apiKey);
    form.append('signature', sig.signature);
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', sig.uploadUrl);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body.secure_url) return resolve(body.secure_url);
      reject(new Error(xhr.status === 413 ? 'That file is too large.' : GENERIC));
    };
    xhr.onerror = () => reject(new Error(CONNECTION_LOST));
    xhr.ontimeout = () => reject(new Error(CONNECTION_LOST));
    xhr.onabort = () => reject(Object.assign(new Error('Upload cancelled'), { name: 'AbortError' }));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}

/** Full flow: audio (+ optional cover) -> storage, then save the track record. */
export async function uploadTrackDirect({ title, audioFile, coverFile, durationSeconds, onProgress, signal }) {
  const audioUrl = await uploadToStorage('audio', audioFile, (p) => onProgress?.(coverFile ? Math.round(p * 0.85) : p), signal);
  let coverUrl = null;
  if (coverFile) {
    // Cover art is a nicety: if only it fails, the track still goes out (without a cover).
    coverUrl = await uploadToStorage('cover', coverFile, (p) => onProgress?.(85 + Math.round(p * 0.15)), signal).catch(() => null);
  }
  try {
    return await api.createSound({ title, audioUrl, coverUrl, durationSeconds });
  } catch (err) {
    throw new Error(err?.message === CONNECTION_LOST ? CONNECTION_LOST : GENERIC);
  }
}
