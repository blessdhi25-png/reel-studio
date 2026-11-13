// Offline feed media manager (Cache API).
//
// Pre-caches the active video and the next few as plain .mp4 responses in
// `clippulse-video-cache-v1`, with FIFO eviction, and keeps a small
// localStorage manifest (`clippulse_offline_manifest`) of the matching post
// metadata so the feed can be rebuilt with no network. This is separate from
// lib/offline.js, which is the user-initiated "download for offline" HLS flow.
//
// Limits worth knowing:
//  - Only direct files are cached (HLS .m3u8 and photos are skipped).
//  - The media host must send CORS headers; an opaque (no-cors) response can't
//    be turned into a playable blob, so those videos are simply not cached.

export const VIDEO_CACHE_NAME = 'clippulse-video-cache-v1';
export const MANIFEST_KEY = 'clippulse_offline_manifest';
export const MAX_CACHED_VIDEOS = 20;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024; // don't swallow the quota with one huge file

const inFlight = new Map(); // videoId -> Promise

export function isVideoCacheSupported() {
  return typeof window !== 'undefined' && 'caches' in window;
}

function readManifest() {
  try {
    const list = JSON.parse(localStorage.getItem(MANIFEST_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeManifest(list) {
  try {
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(list));
  } catch {
    // quota / private mode — the cache still works, only offline feed rebuild is affected
  }
}

function isCacheable(video) {
  if (!video || !video.id || !video.videoUrl || video.pending) return false;
  if (video.mediaType === 'photo') return false;
  if (/\.m3u8(\?|#|$)/i.test(video.videoUrl)) return false;
  return true;
}

// Sync check (manifest only) — used on the hot path in VideoCard so a normal
// online card never pays an async cache lookup before its src is set.
export function isVideoInManifest(videoUrl) {
  if (!videoUrl) return false;
  return readManifest().some((e) => e.videoUrl === videoUrl);
}

export async function getCachedVideoResponse(videoUrl) {
  if (!isVideoCacheSupported() || !videoUrl) return null;
  try {
    return (await caches.match(videoUrl, { cacheName: VIDEO_CACHE_NAME })) || null;
  } catch {
    return null;
  }
}

async function evictOverflow(cache) {
  let list = readManifest();
  while (list.length > MAX_CACHED_VIDEOS) {
    const oldest = list.shift(); // FIFO: manifest is in insertion order
    try {
      await cache.delete(oldest.videoUrl);
    } catch {}
  }
  writeManifest(list);
}

async function cacheOne(video) {
  const cache = await caches.open(VIDEO_CACHE_NAME);
  if (await cache.match(video.videoUrl)) {
    // Already stored — make sure the manifest knows about it.
    const list = readManifest();
    if (!list.some((e) => e.id === video.id)) {
      list.push({ ...video, cachedAt: Date.now() });
      writeManifest(list);
      await evictOverflow(cache);
    }
    return;
  }

  const res = await fetch(video.videoUrl, { mode: 'cors', credentials: 'omit' });
  if (!res.ok || res.status !== 200 || res.type === 'opaque') return;
  const type = res.headers.get('content-type') || '';
  if (!/^video\//i.test(type) && !/octet-stream/i.test(type)) return;
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_VIDEO_BYTES) return;

  try {
    await cache.put(video.videoUrl, res);
  } catch {
    // Quota exceeded: drop the oldest few entries and give up on this one.
    const list = readManifest();
    for (let i = 0; i < 3 && list.length; i++) {
      const old = list.shift();
      try { await cache.delete(old.videoUrl); } catch {}
    }
    writeManifest(list);
    return;
  }

  const list = readManifest().filter((e) => e.id !== video.id);
  list.push({ ...video, cachedAt: Date.now() });
  writeManifest(list);
  await evictOverflow(cache);
}

// Fire-and-forget; safe to call repeatedly (deduped per video id).
export function precacheVideo(video) {
  if (!isVideoCacheSupported() || !isCacheable(video)) return Promise.resolve();
  if (typeof navigator !== 'undefined') {
    if (navigator.onLine === false) return Promise.resolve();
    if (navigator.connection?.saveData) return Promise.resolve(); // respect Data Saver
  }
  if (inFlight.has(video.id)) return inFlight.get(video.id);
  const p = cacheOne(video)
    .catch(() => {})
    .finally(() => inFlight.delete(video.id));
  inFlight.set(video.id, p);
  return p;
}

// Posts that are in the manifest AND whose .mp4 is actually in the cache —
// anything the browser evicted behind our back is dropped from the manifest,
// so the offline feed never renders a black, unplayable card.
export async function getOfflineFeed() {
  if (!isVideoCacheSupported()) return [];
  const list = readManifest();
  const verified = [];
  for (const entry of list) {
    if (await getCachedVideoResponse(entry.videoUrl)) verified.push(entry);
  }
  if (verified.length !== list.length) writeManifest(verified);
  return verified.map(({ cachedAt, ...video }) => video);
}

// Cached media can include private-community clips, so wipe it on logout.
export async function clearVideoCache() {
  try {
    localStorage.removeItem(MANIFEST_KEY);
  } catch {}
  if (isVideoCacheSupported()) {
    try {
      await caches.delete(VIDEO_CACHE_NAME);
    } catch {}
  }
}
