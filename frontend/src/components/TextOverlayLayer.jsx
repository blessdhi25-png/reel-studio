'use client';

// Read-only renderer for a post's text overlays. Used by the feed (VideoCard),
// the upload previews and the editor itself, so what you design is exactly
// what viewers see. Positions are % of the media box; font size is a % of the
// box WIDTH via container-query units (cqw), so text scales with the media on
// every screen. The parent must be `position: relative` with
// `container-type: inline-size` (PhotoMedia and OverlayBox both set it).

export const OVERLAY_FONTS = [
  { id: 'sans', label: 'Modern', stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { id: 'serif', label: 'Classic', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', label: 'Mono', stack: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
  { id: 'display', label: 'Poster', stack: 'Impact, "Arial Black", "Haettenschweiler", sans-serif' },
  { id: 'script', label: 'Script', stack: '"Brush Script MT", "Segoe Script", "Snell Roundhand", cursive' },
];

export function fontStack(id) {
  return (OVERLAY_FONTS.find((f) => f.id === id) || OVERLAY_FONTS[0]).stack;
}

// Shared by the layer and the editor so a draggable preview is pixel-identical
// to the published render.
export function overlayStyle(o) {
  return {
    left: `${o.x}%`,
    top: `${o.y}%`,
    transform: 'translate(-50%, -50%)',
    fontFamily: fontStack(o.font),
    fontSize: `${o.size}cqw`,
    fontWeight: 800, // font-extrabold everywhere: high contrast on any media
    lineHeight: 1.15,
    letterSpacing: '-0.01em',
    color: o.color,
    background: o.pill ? o.pillColor : 'transparent',
    padding: o.pill ? '0.25em 0.6em' : '0.1em 0.2em',
    borderRadius: o.pill ? '0.55em' : 0,
    textShadow: o.pill ? 'none' : '0 0.06em 0.22em rgba(0,0,0,0.75), 0 0 0.04em rgba(0,0,0,0.9)',
    width: 'max-content', // absolute + left:% would otherwise shrink-wrap to the space right of the anchor
    maxWidth: '92%',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    textAlign: 'center',
  };
}

export default function TextOverlayLayer({ overlays }) {
  if (!Array.isArray(overlays) || overlays.length === 0) return null;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {overlays.map((o) => (
        <span key={o.id} className="absolute select-none" style={overlayStyle(o)}>
          {o.text}
        </span>
      ))}
    </div>
  );
}
