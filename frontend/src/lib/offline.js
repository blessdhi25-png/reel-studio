// Downloads an HLS video (playlist + all segments) into the browser's Cache
// Storage so it can be replayed without a network connection. No service
// worker needed — we fetch the files ourselves, store the raw Responses,
// and later rebuild a self-contained playlist from blob: URLs for playback.
//
// Limitation: this caches what's already been transcoded to HLS. There's no
// single downloadable .mp4 to export outside the app — this is "available
// offline within Reel," not "save to your camera roll."

const CACHE_NAME = 'offline-videos-v1';
const INDEX_KEY = 'offlineVideos';

function readIndex() {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeIndex(list) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

function segmentUrlsFromPlaylist(text, baseUrl) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => new URL(line, baseUrl).toString());
}

export function isOfflineSupported() {
  return typeof window !== 'undefined' && 'caches' in window;
}

export function getOfflineVideos() {
  return readIndex();
}

export function isDownloaded(id) {
  return readIndex().some((v) => v.id === id);
}

export async function downloadVideo(video, onProgress) {
  if (!isOfflineSupported()) throw new Error('Offline storage is not supported in this browser');
  if (!video.videoUrl) throw new Error('This video is still processing');

  const cache = await caches.open(CACHE_NAME);
  const masterRes = await fetch(video.videoUrl);
  if (!masterRes.ok) throw new Error('Could not fetch video');
  const masterText = await masterRes.clone().text();
  await cache.put(video.videoUrl, masterRes);

  const baseUrl = video.videoUrl.slice(0, video.videoUrl.lastIndexOf('/') + 1);
  const segmentUrls = segmentUrlsFromPlaylist(masterText, baseUrl);

  let done = 0;
  for (const segUrl of segmentUrls) {
    const res = await fetch(segUrl);
    if (res.ok) await cache.put(segUrl, res);
    done += 1;
    onProgress?.(done / Math.max(segmentUrls.length, 1));
  }

  const list = readIndex();
  if (!list.some((v) => v.id === video.id)) {
    list.push({
      id: video.id,
      caption: video.caption || '',
      thumbnailUrl: video.thumbnailUrl || '',
      videoUrl: video.videoUrl,
      savedAt: Date.now(),
    });
    writeIndex(list);
  }
}

export async function removeDownload(id) {
  const list = readIndex();
  const entry = list.find((v) => v.id === id);
  if (entry) {
    const cache = await caches.open(CACHE_NAME);
    const masterRes = await cache.match(entry.videoUrl);
    if (masterRes) {
      const text = await masterRes.text();
      const baseUrl = entry.videoUrl.slice(0, entry.videoUrl.lastIndexOf('/') + 1);
      for (const segUrl of segmentUrlsFromPlaylist(text, baseUrl)) {
        await cache.delete(segUrl);
      }
    }
    await cache.delete(entry.videoUrl);
  }
  writeIndex(list.filter((v) => v.id !== id));
}

// Rebuilds a playable playlist entirely from cached bytes as blob: URLs, so
// <video>/hls.js can play it with zero network requests.
export async function getPlaybackUrl(id) {
  const entry = readIndex().find((v) => v.id === id);
  if (!entry) return null;

  const cache = await caches.open(CACHE_NAME);
  const masterRes = await cache.match(entry.videoUrl);
  if (!masterRes) return null;

  const text = await masterRes.text();
  const baseUrl = entry.videoUrl.slice(0, entry.videoUrl.lastIndexOf('/') + 1);

  const lines = await Promise.all(
    text.split('\n').map(async (line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      const segUrl = new URL(trimmed, baseUrl).toString();
      const segRes = await cache.match(segUrl);
      if (!segRes) return line; // missing segment — leave as-is, will just fail to play that chunk
      const blob = await segRes.blob();
      return URL.createObjectURL(blob);
    })
  );

  const playlistBlob = new Blob([lines.join('\n')], { type: 'application/vnd.apple.mpegurl' });
  return URL.createObjectURL(playlistBlob);
}
