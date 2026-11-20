// Device and (optional) location text attached to a support ticket. Both are shown to the person on the form
// before they submit, and the location is only ever read when they have already allowed it or tap "Share".

export function describeThisDevice() {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent || '';
  const hints = navigator.userAgentData;
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux/.test(ua) ? 'Linux'
    : hints?.platform || navigator.platform || 'Unknown OS';
  const match = (re) => (ua.match(re) || [])[1]?.split('.')[0];
  const browser = /Edg\//.test(ua) ? `Edge ${match(/Edg\/([\d.]+)/) || ''}`
    : /OPR\//.test(ua) ? `Opera ${match(/OPR\/([\d.]+)/) || ''}`
    : /Firefox\//.test(ua) ? `Firefox ${match(/Firefox\/([\d.]+)/) || ''}`
    : /Chrome\/|CriOS\//.test(ua) ? `Chrome ${match(/(?:Chrome|CriOS)\/([\d.]+)/) || ''}`
    : /Safari\//.test(ua) ? `Safari ${match(/Version\/([\d.]+)/) || ''}`
    : 'Browser';
  const screen = typeof window !== 'undefined' && window.screen ? ` · ${window.screen.width}×${window.screen.height}` : '';
  const lang = navigator.language ? ` · ${navigator.language}` : '';
  return `${browser.trim()} on ${os}${screen}${lang}`;
}

// 5.6037° N, 0.1870° W (±25 m)
export function formatCoords({ latitude, longitude, accuracy }) {
  const lat = `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? 'N' : 'S'}`;
  const lng = `${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lng}${Number.isFinite(accuracy) ? ` (±${Math.round(accuracy)} m)` : ''}`;
}

export function locationPermission() {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return Promise.resolve('unknown');
  return navigator.permissions.query({ name: 'geolocation' }).then((r) => r.state).catch(() => 'unknown');
}

export function readLocation() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(formatCoords(pos.coords)),
      (err) => reject(err),
      { timeout: 12000, maximumAge: 60000 },
    );
  });
}
