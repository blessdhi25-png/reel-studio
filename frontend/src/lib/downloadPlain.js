// Saves a clip exactly as stored — no re-encode, no watermark. Used when the
// user has turned off Settings → Video Downloads & Watermarking.
//
// Tries a blob download first so the file gets a proper name; if the host
// blocks cross-origin reads (CORS) it falls back to a plain download link.
// Adaptive (HLS) streams are a playlist, not a file, so they can't be saved.
export class PlainDownloadUnsupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PlainDownloadUnsupportedError';
  }
}

function triggerDownload(href, filename) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadPlain({ url, baseName = 'clippulse' }) {
  if (/\.m3u8(\?|$)/i.test(url)) {
    throw new PlainDownloadUnsupportedError("Streamed (HLS) videos can't be saved directly.");
  }
  const ext = (url.split('?')[0].match(/\.(mp4|webm|mov)$/i) || [, 'mp4'])[1].toLowerCase();
  const filename = `${baseName}.${ext}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const objectUrl = URL.createObjectURL(await res.blob());
    triggerDownload(objectUrl, filename);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  } catch {
    // CORS-blocked or network hiccup: let the browser fetch it itself.
    triggerDownload(url, filename);
  }
}
