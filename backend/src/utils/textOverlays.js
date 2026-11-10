// Validates/normalises the text-overlay JSON sent with a post. Stored as-is in
// Video.textOverlays and rendered by the frontend's TextOverlayLayer, so every
// field is clamped or allow-listed here — nothing user-supplied reaches the
// DOM unchecked (colours become inline styles, fonts map to a fixed list).
export const OVERLAY_FONTS = ['sans', 'serif', 'mono', 'display', 'script'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_OVERLAYS = 8;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function sanitizeTextOverlays(raw) {
  let value = raw;
  if (typeof value === 'string') {
    if (!value.trim()) return null;
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const o of value.slice(0, MAX_OVERLAYS)) {
    if (!o || typeof o !== 'object') continue;
    const text = String(o.text ?? '').slice(0, 120).trim();
    if (!text) continue;
    const x = Number(o.x), y = Number(o.y), size = Number(o.size);
    out.push({
      id: String(o.id ?? out.length).slice(0, 24),
      text,
      x: clamp(Number.isFinite(x) ? x : 50, 0, 100),
      y: clamp(Number.isFinite(y) ? y : 50, 0, 100),
      size: clamp(Number.isFinite(size) ? size : 7, 3, 20), // % of media width
      font: OVERLAY_FONTS.includes(o.font) ? o.font : 'sans',
      color: HEX.test(o.color) ? o.color : '#ffffff',
      pill: !!o.pill,
      pillColor: HEX.test(o.pillColor) ? o.pillColor : '#000000',
    });
  }
  return out.length ? out : null;
}
