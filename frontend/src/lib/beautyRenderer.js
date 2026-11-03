// Real-time WebGL look pipeline for the camera recorder.
//
// One fragment shader does, in order:
//   1. skin-aware bilateral smoothing (edge-preserving, so eyes/lips/hair keep
//      their sharpness) and, for the Glow lens, a soft bloom
//   2. colour grade (the lens's CSS-filter-style ops, folded into one matrix)
//   3. optional split-tone, vignette and film grain
//
// The result is drawn into an offscreen canvas that CameraRecorder copies onto
// its 2D compositor canvas each frame. That 2D canvas is also what
// MediaRecorder captures, so everything here is baked into the saved video.
//
// Skin detection is a YCbCr colour test, not face detection: it's cheap enough
// for 60fps on phones, but warm-coloured backgrounds (wood, sand) can be
// smoothed too.

import { resolveLook } from './cameraFilters';

const VERT = `
attribute vec2 a_pos;
uniform vec4 u_rect;     // source UV rect: x, y, w, h (top-left origin)
uniform float u_mirror;  // 1.0 = flip horizontally (selfie view)
varying vec2 v_uv;
varying vec2 v_screen;
void main() {
  vec2 t = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  v_screen = t;
  if (u_mirror > 0.5) t.x = 1.0 - t.x;
  v_uv = u_rect.xy + t * u_rect.zw;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Eight directions around a circle. The tap calls are generated rather than
// looped so every offset is a compile-time constant on every driver.
const DIRS = [
  [1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071],
  [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071],
];
const ring = (scale, weight) =>
  DIRS.map(
    ([x, y]) =>
      `    tap(vec2(${(x * scale).toFixed(4)}, ${(y * scale).toFixed(4)}), ${weight}, c0, inv2s, stepPx, accB, wB, accG, wG);`
  ).join('\n');

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_tex;
uniform vec2 u_step;      // source UV per output pixel
uniform float u_smooth;   // 0..1 bilateral strength
uniform float u_radius;   // tap spacing in output pixels
uniform float u_sigma;    // bilateral colour tolerance
uniform float u_bloom;
uniform float u_vignette;
uniform float u_grain;
uniform float u_time;
uniform float u_toneAmt;
uniform vec3 u_toneS;
uniform vec3 u_toneH;
uniform mat3 u_m;
uniform vec3 u_b;
varying vec2 v_uv;
varying vec2 v_screen;

float skin(vec3 c) {
  float y  = dot(c, vec3(0.299, 0.587, 0.114));
  float cb = 0.5 + dot(c, vec3(-0.168736, -0.331264, 0.5));
  float cr = 0.5 + dot(c, vec3(0.5, -0.418688, -0.081312));
  float mcb = smoothstep(0.28, 0.31, cb) * (1.0 - smoothstep(0.49, 0.52, cb));
  float mcr = smoothstep(0.50, 0.53, cr) * (1.0 - smoothstep(0.67, 0.70, cr));
  float my  = smoothstep(0.08, 0.22, y) * (1.0 - smoothstep(0.97, 1.0, y));
  return mcb * mcr * my;
}

void tap(vec2 o, float ws, vec3 c0, float inv2s, vec2 stepPx,
         inout vec3 accB, inout float wB, inout vec3 accG, inout float wG) {
  vec3 s = texture2D(u_tex, v_uv + o * stepPx).rgb;
  vec3 d = s - c0;
  float wr = exp(-dot(d, d) * inv2s);
  accB += s * ws * wr; wB += ws * wr;
  accG += s * ws;      wG += ws;
}

void main() {
  vec3 c0 = texture2D(u_tex, v_uv).rgb;
  vec3 col = c0;

  if (u_smooth > 0.001 || u_bloom > 0.001) {
    vec2 stepPx = u_step * u_radius;
    float inv2s = 1.0 / (2.0 * u_sigma * u_sigma);
    vec3 accB = c0; float wB = 1.0;
    vec3 accG = c0; float wG = 1.0;

    // Ring 1 (8 taps)
${ring(1, '0.80')}
#ifdef HQ
    // Ring 2 (8 taps at double radius)
${ring(2, '0.41')}
#endif

    vec3 bil = accB / wB;
    vec3 gau = accG / wG;

    col = mix(c0, bil, skin(bil) * u_smooth);

    vec3 hi = max(gau - 0.55, 0.0);
    col = 1.0 - (1.0 - col) * (1.0 - clamp(hi * u_bloom * 1.6, 0.0, 1.0));
  }

  col = clamp(u_m * col + u_b, 0.0, 1.0);

  if (u_toneAmt > 0.0) {
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = clamp(col + (u_toneS * (1.0 - l) + u_toneH * l) * u_toneAmt, 0.0, 1.0);
  }

  if (u_vignette > 0.0) {
    float r = length(v_screen - 0.5) * 1.4142;
    col *= 1.0 - u_vignette * smoothstep(0.35, 1.0, r);
  }

  if (u_grain > 0.0) {
    float n = fract(sin(dot(gl_FragCoord.xy + u_time * 60.0, vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) * u_grain;
  }

  gl_FragColor = vec4(col, 1.0);
}`;

const UNIFORMS = [
  'u_tex', 'u_rect', 'u_mirror', 'u_step', 'u_smooth', 'u_radius', 'u_sigma', 'u_bloom',
  'u_vignette', 'u_grain', 'u_time', 'u_toneAmt', 'u_toneS', 'u_toneH', 'u_m', 'u_b',
];

// cover: crop the source to fill the destination with no letterboxing.
// contain: letterbox/pillarbox to show the whole source.
export function computeDrawRect(srcW, srcH, dstW, dstH, fit) {
  if (!srcW || !srcH) return { sx: 0, sy: 0, sw: dstW, sh: dstH, dx: 0, dy: 0, dw: dstW, dh: dstH };
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  if (fit === 'contain') {
    let w = dstW;
    let h = dstW / srcRatio;
    if (h > dstH) {
      h = dstH;
      w = dstH * srcRatio;
    }
    return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx: (dstW - w) / 2, dy: (dstH - h) / 2, dw: w, dh: h };
  }
  let sw = srcW;
  let sh = srcH;
  let sx = 0;
  let sy = 0;
  if (srcRatio > dstRatio) {
    sw = srcH * dstRatio;
    sx = (srcW - sw) / 2;
  } else {
    sh = srcW / dstRatio;
    sy = (srcH - sh) / 2;
  }
  return { sx, sy, sw, sh, dx: 0, dy: 0, dw: dstW, dh: dstH };
}

export class BeautyRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.gl = null;
    this.ready = false;
    this.programs = {};
    this.tex = null;
    this.texW = 0;
    this.texH = 0;
    this.onReadyChange = null; // (ready: boolean) => void — fired on context loss/restore

    this._onLost = (e) => {
      e.preventDefault(); // required, otherwise the browser never restores the context
      this.ready = false;
      this.programs = {};
      this.tex = null;
      this.texW = 0;
      this.texH = 0;
      this.onReadyChange?.(false);
    };
    this._onRestored = () => {
      this._initGL();
      this.onReadyChange?.(this.ready);
    };
    this.canvas.addEventListener('webglcontextlost', this._onLost, false);
    this.canvas.addEventListener('webglcontextrestored', this._onRestored, false);

    this._initGL();
  }

  _initGL() {
    this.ready = false;
    let gl = null;
    try {
      gl = this.canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
        // Refuse software rasterisers (SwiftShader etc.): they'd turn a
        // "free" GPU pass into a CPU hog and sink the frame rate. The caller
        // falls back to the plain 2D path instead.
        failIfMajorPerformanceCaveat: true,
      });
    } catch {
      gl = null;
    }
    if (!gl) return;
    this.gl = gl;

    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.programs = {};
    this.ready = !!this._program(true);
  }

  _program(hq) {
    const key = hq ? 'hq' : 'lq';
    if (this.programs[key]) return this.programs[key];
    const gl = this.gl;
    if (!gl) return null;

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('[beautyRenderer] shader compile failed:', gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, (hq ? '#define HQ\n' : '') + FRAG);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[beautyRenderer] program link failed:', gl.getProgramInfoLog(program));
      return null;
    }

    const u = {};
    UNIFORMS.forEach((name) => {
      u[name] = gl.getUniformLocation(program, name);
    });
    const entry = { program, u, aPos: gl.getAttribLocation(program, 'a_pos') };
    this.programs[key] = entry;
    return entry;
  }

  resize(w, h) {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  // source: HTMLVideoElement | HTMLCanvasElement. `upload` says whether the
  // source has a new frame since the last call; texture uploads are the most
  // expensive thing here on phones, so callers skip them for repeated frames.
  // Returns false if nothing was drawn (not ready / source not usable yet).
  render(source, srcW, srcH, rect, look, { mirror = false, upload = true, time = 0 } = {}) {
    if (!this.ready || !srcW || !srcH) return false;
    const gl = this.gl;
    const prog = this._program(look.hq);
    if (!prog) return false;

    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    if (upload || this.texW !== srcW || this.texH !== srcH) {
      try {
        if (this.texW === srcW && this.texH === srcH) {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
        } else {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
          this.texW = srcW;
          this.texH = srcH;
        }
      } catch {
        return false;
      }
    }

    const W = this.canvas.width;
    const H = this.canvas.height;
    if (rect.dw < W - 0.5 || rect.dh < H - 0.5) {
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT); // letterbox bars
    }
    gl.viewport(
      Math.round(rect.dx),
      Math.round(H - rect.dy - rect.dh),
      Math.round(rect.dw),
      Math.round(rect.dh)
    );

    gl.useProgram(prog.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(prog.aPos);
    gl.vertexAttribPointer(prog.aPos, 2, gl.FLOAT, false, 0, 0);

    const u = prog.u;
    gl.uniform1i(u.u_tex, 0);
    gl.uniform4f(u.u_rect, rect.sx / srcW, rect.sy / srcH, rect.sw / srcW, rect.sh / srcH);
    gl.uniform1f(u.u_mirror, mirror ? 1 : 0);
    gl.uniform2f(u.u_step, rect.sw / srcW / rect.dw, rect.sh / srcH / rect.dh);
    gl.uniform1f(u.u_smooth, look.needsNeighbourhood ? look.smooth : 0);
    gl.uniform1f(u.u_radius, look.radius);
    gl.uniform1f(u.u_sigma, look.sigma);
    gl.uniform1f(u.u_bloom, look.needsNeighbourhood ? look.bloom : 0);
    gl.uniform1f(u.u_vignette, look.vignette);
    gl.uniform1f(u.u_grain, look.grain);
    gl.uniform1f(u.u_time, time);
    gl.uniform1f(u.u_toneAmt, look.toneAmount);
    gl.uniform3fv(u.u_toneS, look.toneShadow);
    gl.uniform3fv(u.u_toneH, look.toneHighlight);
    gl.uniformMatrix3fv(u.u_m, false, look.m);
    gl.uniform3fv(u.u_b, look.b);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }

  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this._onLost);
    this.canvas.removeEventListener('webglcontextrestored', this._onRestored);
    this.ready = false;
    // Hand the GPU context back right away — phones only allow a handful.
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }
}

// Returns a renderer, or null when WebGL isn't usable (callers fall back to
// plain 2D canvas drawing).
export function createBeautyRenderer() {
  if (typeof document === 'undefined') return null;
  const r = new BeautyRenderer();
  return r.ready ? r : null;
}

// ---------------------------------------------------------------------------
// Filter preview thumbnails
// ---------------------------------------------------------------------------

let previewRenderer = null;
let samplePortrait = null;

// A small procedural portrait, used for filter thumbnails when the camera
// isn't running yet. It has fine skin texture so smoothing is visible.
function getSamplePortrait() {
  if (samplePortrait) return samplePortrait;
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 160;
  const g = c.getContext('2d');

  const bg = g.createLinearGradient(0, 0, 0, 160);
  bg.addColorStop(0, '#8fa3b8');
  bg.addColorStop(1, '#5b6b7d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 160, 160);

  g.fillStyle = '#2f3a4a'; // shoulders
  g.beginPath();
  g.ellipse(80, 178, 72, 50, 0, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = '#cf9876'; // neck
  g.fillRect(68, 104, 24, 34);

  g.fillStyle = '#2b1d17'; // hair behind the face
  g.beginPath();
  g.ellipse(80, 70, 36, 44, 0, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = '#e3b08f'; // face
  g.beginPath();
  g.ellipse(80, 78, 29, 36, 0, 0, Math.PI * 2);
  g.fill();

  // Deterministic speckle so the smoothing pass has something to smooth.
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 260; i += 1) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd());
    const x = 80 + Math.cos(a) * r * 27;
    const y = 78 + Math.sin(a) * r * 34;
    g.fillStyle = rnd() > 0.5 ? 'rgba(150,90,60,0.22)' : 'rgba(255,225,200,0.22)';
    g.fillRect(x, y, 1.6, 1.6);
  }

  g.fillStyle = '#2b1d17'; // fringe, eyes, brows, mouth
  g.beginPath();
  g.ellipse(80, 52, 30, 14, 0, Math.PI, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(69, 78, 2.2, 0, Math.PI * 2);
  g.arc(91, 78, 2.2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#a5524c';
  g.lineWidth = 2.2;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(80, 92, 8, 0.2 * Math.PI, 0.8 * Math.PI);
  g.stroke();

  samplePortrait = c;
  return c;
}

// Draws one lens preview onto a square 2D canvas. Uses the live camera frame
// when there is one, otherwise the sample portrait. Cheap enough to call for
// every lens a few times per second; callers skip it while recording.
export function drawLensPreview(target, lensId, { video, mirror = false, retouch = false, referenceHeight = 640 } = {}) {
  const size = target.width;
  const ctx = target.getContext('2d');
  if (!ctx || !size) return;

  const live = !!(video && video.readyState >= 2 && video.videoWidth);
  const source = live ? video : getSamplePortrait();
  const srcW = live ? video.videoWidth : source.width;
  const srcH = live ? video.videoHeight : source.height;
  const rect = computeDrawRect(srcW, srcH, size, size, 'cover');

  const base = resolveLook(lensId, { retouch, height: referenceHeight, quality: 2 });
  // Keep the smoothing radius proportional to the image, not the thumbnail.
  const look = { ...base, radius: Math.max(0.9, (base.radius * size) / referenceHeight) };

  if (!previewRenderer) previewRenderer = new BeautyRenderer();
  if (previewRenderer.ready) {
    previewRenderer.resize(size, size);
    const ok = previewRenderer.render(source, srcW, srcH, rect, look, { mirror: live && mirror, upload: true });
    if (ok) {
      ctx.drawImage(previewRenderer.canvas, 0, 0, size, size);
      return;
    }
  }

  // Fallback: CSS filter on a 2D canvas (no smoothing; unsupported filters
  // just draw unfiltered).
  ctx.save();
  if (live && mirror) {
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
  }
  ctx.filter = look.css || 'none';
  ctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, size, size);
  ctx.restore();
}

export function disposePreviewRenderer() {
  previewRenderer?.dispose();
  previewRenderer = null;
}
