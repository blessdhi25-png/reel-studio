// Template catalog for the studio's Templates tab.
//
// There's no backend Template model yet, so this is a fixed local catalog.
// Each entry carries everything the studio needs to set itself up when the
// template is chosen:
//   clipSeconds  per-clip timing (its sum is the recording length)
//   effectId     overlay effect to switch on (an id from the studio's EFFECTS)
//   trackId      id of the sound track to attach (null = none yet)
// plus display metadata (title, tag, uses, sound name) and a looping preview.
//
// `trackId` is null for every entry shipped here: real ids come from the
// tracks table, so fill them in once you've picked the sounds.
//
// Previews live under /public/templates. The clips that ship are abstract
// placeholders made by scripts/make-template-previews.py; drop real previews
// in at the same paths. A template with no previewUrl falls back to one of the
// generic loops (see resolveTemplatePreview).
//
// `uses` is a raw number; the card formats it ("1.2M videos") so it can be
// swapped for a live count from an API later without touching the UI.

export const TEMPLATE_CATEGORIES = [
  'For You', 'Viral Song', 'Trendy', 'AI', 'Monthly Recap', 'Daily life', 'Aesthetic', 'One Clip',
];

const preview = (id) => ({ previewUrl: `/templates/${id}.mp4`, posterUrl: `/templates/${id}.jpg` });
const evenClips = (count, seconds) => Array.from({ length: count }, () => seconds);

export const TEMPLATES = [
  { id: 'tp1', title: 'July is calling', category: 'Monthly Recap', clipCount: 6, clipSeconds: evenClips(6, 2.5), uses: 185200, tag: 'Trending', sound: 'Summer Drive', trackId: null, effectId: 'sparkle', ...preview('tp1') },
  { id: 'tp2', title: 'Then vs Now', category: 'Trendy', clipCount: 2, clipSeconds: [4, 4], uses: 92400, tag: 'Viral', sound: 'Time Machine', trackId: null, effectId: 'none', ...preview('tp2') },
  { id: 'tp3', title: 'AI Fridge Magnet Football', category: 'AI', clipCount: 1, clipSeconds: [8], uses: 340700, tag: 'AI', sound: 'Stadium Echo', trackId: null, effectId: 'glowframe', ...preview('tp3') },
  { id: 'tp4', title: 'World Cup Player Avatar', category: 'AI', clipCount: 1, clipSeconds: [10], uses: 1210000, tag: 'AI', sound: 'Final Whistle', trackId: null, effectId: 'mesh', ...preview('tp4') },
  { id: 'tp5', title: 'Crochet Yourself', category: 'AI', clipCount: 1, clipSeconds: [7], uses: 128300, tag: 'AI', sound: 'Soft Thread', trackId: null, effectId: 'hearts', ...preview('tp5') },
  { id: 'tp6', title: 'A Day in My Life', category: 'Daily life', clipCount: 8, clipSeconds: evenClips(8, 2), uses: 76100, tag: 'New', sound: 'Morning Light', trackId: null, effectId: 'none', ...preview('tp6') },
  { id: 'tp7', title: 'Golden Hour Moodboard', category: 'Aesthetic', clipCount: 5, clipSeconds: evenClips(5, 3), uses: 54800, tag: 'Aesthetic', sound: 'Golden Hour', trackId: null, effectId: 'glowframe', ...preview('tp7') },
  { id: 'tp8', title: 'One Take Glow Up', category: 'One Clip', clipCount: 1, clipSeconds: [12], uses: 301500, tag: 'Viral', sound: 'Glow Up', trackId: null, effectId: 'sparkle', ...preview('tp8') },
  { id: 'tp9', title: 'Beat Drop Sync', category: 'Viral Song', clipCount: 4, clipSeconds: evenClips(4, 3), uses: 1480000, tag: 'Trending', sound: 'Beat Drop Loop', trackId: null, effectId: 'mesh', ...preview('tp9') },
  { id: 'tp10', title: 'Slow Motion Reveal', category: 'Trendy', clipCount: 3, clipSeconds: [4, 4, 4], uses: 67200, tag: 'New', sound: 'Slow Burn', trackId: null, effectId: 'snow', ...preview('tp10') },
  { id: 'tp11', title: 'This Month in Review', category: 'Monthly Recap', clipCount: 10, clipSeconds: evenClips(10, 2), uses: 145600, tag: 'Trending', sound: 'Recap Theme', trackId: null, effectId: 'sparkle', ...preview('tp11') },
  { id: 'tp12', title: 'Minimal Morning', category: 'Aesthetic', clipCount: 6, clipSeconds: evenClips(6, 2.5), uses: 38900, tag: 'Aesthetic', sound: 'Quiet Coffee', trackId: null, effectId: 'none', ...preview('tp12') },
];

// Generic loops for templates that don't ship their own preview. They're
// static assets under /public, so on Vercel they're served from its edge CDN.
// To point at an external CDN instead, set NEXT_PUBLIC_TEMPLATE_FALLBACK_URLS
// to a comma-separated list of MP4 URLs.
const LOCAL_FALLBACKS = [1, 2, 3].map((n) => ({
  src: `/templates/fallback-${n}.mp4`,
  poster: `/templates/fallback-${n}.jpg`,
}));

function fallbackLoops() {
  // Next inlines process.env.NEXT_PUBLIC_* at build time; the typeof guard just
  // keeps this module safe in any other bundler/test environment.
  const raw = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_TEMPLATE_FALLBACK_URLS : '';
  const fromEnv = (raw || '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv.map((src) => ({ src, poster: undefined })) : LOCAL_FALLBACKS;
}

// Stable pick, so a given template always gets the same fallback loop.
export function fallbackPreviewFor(template) {
  const loops = fallbackLoops();
  let hash = 0;
  for (const ch of String(template.id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { ...loops[hash % loops.length], fallback: true };
}

export function resolveTemplatePreview(template) {
  if (template.previewUrl) {
    return { src: template.previewUrl, poster: template.posterUrl, fallback: false };
  }
  return fallbackPreviewFor(template);
}

// What gets attached to the studio when a template is chosen.
export function templateSetup(template) {
  const clipSeconds =
    Array.isArray(template.clipSeconds) && template.clipSeconds.length ? template.clipSeconds : [15];
  const totalSeconds = Math.max(3, Math.round(clipSeconds.reduce((a, b) => a + b, 0)));
  return {
    id: template.id,
    title: template.title,
    clipCount: template.clipCount || clipSeconds.length,
    clipSeconds,
    totalSeconds,
    effectId: template.effectId || 'none',
    trackId: template.trackId ?? null,
    soundTitle: template.sound || null,
  };
}
