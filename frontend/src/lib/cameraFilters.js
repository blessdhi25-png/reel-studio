// Camera "lenses" (look presets) shared by the studio UI and the WebGL
// renderer in lib/beautyRenderer.js.
//
// Each lens is described once, as a list of CSS-filter-style ops plus a few
// shader-only extras (vignette, grain, bloom, split-tone). From that single
// description we derive both:
//   - an affine RGB transform (3x3 matrix + offset) that the fragment shader
//     applies in one multiply-add, and
//   - an equivalent CSS filter string, used only by the 2D-canvas fallback
//     when WebGL isn't available.
// Composing the ops into one matrix means values can differ marginally from
// a real CSS filter chain, which clamps to [0,1] between steps.

// Strength used when Retouch is on and the lens doesn't set its own.
export const RETOUCH_DEFAULT_SMOOTH = 0.5;

export const FILTERS = [
  {
    id: 'normal',
    label: 'Original',
    ops: [],
  },
  {
    id: 'beauty',
    label: 'Beautify',
    // Light skin warming + lift, per the studio spec:
    // sepia(0.08) brightness(1.08) contrast(1.05), plus edge-preserving
    // smoothing and a soft vignette.
    ops: [['sepia', 0.08], ['brightness', 1.08], ['contrast', 1.05]],
    smooth: 0.6,
    vignette: 0.28,
  },
  {
    id: 'vintage',
    label: 'Vintage',
    ops: [['sepia', 0.4], ['contrast', 1.1], ['saturate', 1.3], ['brightness', 1.05]],
    vignette: 0.4,
    grain: 0.035,
  },
  {
    id: 'noir',
    label: 'B&W Noir',
    ops: [['grayscale', 1], ['contrast', 1.3], ['brightness', 0.95]],
    vignette: 0.5,
  },
  {
    id: 'warm',
    label: 'Warm',
    ops: [['sepia', 0.2], ['saturate', 1.4], ['hue-rotate', -8], ['brightness', 1.05]],
    vignette: 0.15,
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    ops: [['hue-rotate', 220], ['saturate', 2.2], ['contrast', 1.2]],
    // Magenta in the shadows, cyan in the highlights.
    tone: { shadow: [0.55, 0.0, 0.85], highlight: [0.0, 0.85, 1.0], amount: 0.14 },
    vignette: 0.2,
  },
  {
    id: 'glow',
    label: 'Glow',
    ops: [['brightness', 1.25], ['contrast', 0.9], ['saturate', 1.25]],
    bloom: 0.55,
  },
];

export const DEFAULT_FILTER_ID = 'beauty';

export function getFilter(idOrLens) {
  if (idOrLens && typeof idOrLens === 'object') return idOrLens;
  return FILTERS.find((f) => f.id === idOrLens) || FILTERS[0];
}

// --- ops -> CSS string (2D fallback only) -------------------------------

export function opsToCss(ops) {
  return ops
    .map(([name, v]) => `${name}(${name === 'hue-rotate' ? `${v}deg` : v})`)
    .join(' ');
}

// --- ops -> affine RGB transform ----------------------------------------

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function mul3(a, b) {
  const o = new Array(9).fill(0);
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      for (let k = 0; k < 3; k += 1) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
    }
  }
  return o;
}

function opToAffine(name, v) {
  switch (name) {
    case 'brightness':
      return { A: I3.map((x) => x * v), c: [0, 0, 0] };
    case 'contrast': {
      const off = 0.5 * (1 - v);
      return { A: I3.map((x) => x * v), c: [off, off, off] };
    }
    case 'saturate':
      return {
        A: [
          0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v,
          0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v,
          0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v,
        ],
        c: [0, 0, 0],
      };
    case 'grayscale': {
      const k = 1 - v;
      return {
        A: [
          0.2126 + 0.7874 * k, 0.7152 - 0.7152 * k, 0.0722 - 0.0722 * k,
          0.2126 - 0.2126 * k, 0.7152 + 0.2848 * k, 0.0722 - 0.0722 * k,
          0.2126 - 0.2126 * k, 0.7152 - 0.7152 * k, 0.0722 + 0.9278 * k,
        ],
        c: [0, 0, 0],
      };
    }
    case 'sepia': {
      const k = 1 - v;
      return {
        A: [
          0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k,
          0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k,
          0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k,
        ],
        c: [0, 0, 0],
      };
    }
    case 'hue-rotate': {
      const rad = (v * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      return {
        A: [
          0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
          0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283,
          0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072,
        ],
        c: [0, 0, 0],
      };
    }
    default:
      return { A: I3, c: [0, 0, 0] };
  }
}

// Returns { m, b }: m is a column-major mat3 (ready for uniformMatrix3fv),
// b is the RGB offset. out = m * rgb + b.
export function opsToAffine(ops) {
  let M = I3;
  let b = [0, 0, 0];
  ops.forEach(([name, v]) => {
    const { A, c } = opToAffine(name, v);
    M = mul3(A, M);
    b = [
      A[0] * b[0] + A[1] * b[1] + A[2] * b[2] + c[0],
      A[3] * b[0] + A[4] * b[1] + A[5] * b[2] + c[1],
      A[6] * b[0] + A[7] * b[1] + A[8] * b[2] + c[2],
    ];
  });
  const m = new Float32Array(9);
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) m[c * 3 + r] = M[r * 3 + c];
  return { m, b: new Float32Array(b) };
}

// Everything the shader needs for one frame, derived from a lens + the
// Retouch toggle + current output size + render quality tier.
//
// quality: 2 = full (17-tap bilateral + bloom), 1 = reduced (9-tap), 0 = grade
// only (no neighbourhood sampling). The recorder steps this down on its own if
// frames start taking too long.
export function resolveLook(lensOrId, { retouch = false, height = 640, quality = 2 } = {}) {
  const lens = getFilter(lensOrId);
  const { m, b } = opsToAffine(lens.ops);

  const smooth = quality >= 1 && retouch ? Math.max(lens.smooth || 0, RETOUCH_DEFAULT_SMOOTH) : 0;
  const bloom = quality >= 2 ? lens.bloom || 0 : 0;
  const scale = Math.max(0.6, height / 640);
  let radius = (1.2 + smooth * 2.4) * scale;
  if (bloom > 0) radius = Math.max(radius, 4.5 * scale);

  const tone = lens.tone;
  return {
    id: lens.id,
    css: opsToCss(lens.ops),
    m,
    b,
    smooth,
    bloom,
    radius,
    sigma: 0.05 + smooth * 0.13, // colour tolerance: higher = smooths across larger differences
    vignette: lens.vignette || 0,
    grain: lens.grain || 0,
    toneAmount: tone ? tone.amount : 0,
    toneShadow: new Float32Array(tone ? tone.shadow : [0, 0, 0]),
    toneHighlight: new Float32Array(tone ? tone.highlight : [0, 0, 0]),
    hq: quality >= 2,
    needsNeighbourhood: quality >= 1 && (smooth > 0.001 || bloom > 0.001),
  };
}
