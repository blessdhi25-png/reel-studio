import prisma from '../config/db.js';

// Coarse, human label from the User-Agent ("Web (Chrome on Windows)"). Only meant to help someone
// recognise their own sign-ins, so a loose match is fine.
export function describeDevice(ua = '') {
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux/.test(ua) ? 'Linux'
    : null;
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS/.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : null;
  if (!os && !browser) return 'Web';
  return `Web (${[browser, os].filter(Boolean).join(' on ')})`;
}

// Region from whichever edge/CDN header is present (Cloudflare, Vercel, Fly…). Null when the
// deployment doesn't provide one — we never look IPs up ourselves.
function locationFrom(req) {
  const h = req.headers;
  const country = h['cf-ipcountry'] || h['x-vercel-ip-country'] || h['x-country-code'] || null;
  const region = h['x-vercel-ip-country-region'] || null;
  const city = h['x-vercel-ip-city'] ? decodeURIComponent(h['x-vercel-ip-city']) : null;
  const parts = [city, region, country && country !== 'XX' ? country : null].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** Fire-and-forget: a failure here must never block someone from signing in. */
export function recordLogin(req, userId, method = 'password') {
  prisma.loginEvent
    .create({ data: { userId, method, device: describeDevice(req.headers['user-agent'] || ''), location: locationFrom(req) } })
    .catch((err) => console.error('[loginEvents] could not record sign-in:', err.message));
}
