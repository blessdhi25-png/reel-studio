// Cached-media accounting for Settings → Storage & Cache.
//
// "Cached media" = everything in Cache Storage. In this app that is the offline
// downloads from lib/offline.js ('offline-videos-v1'). Clearing it also resets
// that module's localStorage index, otherwise the UI would still list videos
// whose files are gone.

const OFFLINE_INDEX_KEY = 'offlineVideos';

export function isCacheSupported() {
  return typeof window !== 'undefined' && 'caches' in window;
}

export async function getCachedMediaBytes() {
  if (!isCacheSupported()) return 0;
  let total = 0;
  for (const name of await caches.keys()) {
    const cache = await caches.open(name);
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      if (!res) continue;
      const len = Number(res.headers.get('content-length'));
      total += len > 0 ? len : (await res.blob()).size;
    }
  }
  return total;
}

export async function clearCachedMedia() {
  if (!isCacheSupported()) return;
  await Promise.all((await caches.keys()).map((name) => caches.delete(name)));
  try {
    window.localStorage.removeItem(OFFLINE_INDEX_KEY);
  } catch {}
}

export function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}
