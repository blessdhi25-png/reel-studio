'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Check, Type } from 'lucide-react';
import { OVERLAY_FONTS, overlayStyle } from './TextOverlayLayer';

// Text overlay studio. Drop it inside any `relative` media box that sets
// `container-type: inline-size` (PhotoMedia does; the video preview wraps it
// in OverlayBox below) and it adds:
//   - an "Aa" button to add text,
//   - draggable overlays (tap one to select it),
//   - a bottom panel: text, font family, colour picker, size, and a
//     background-pill toggle with its own colour.
// It is controlled: `overlays` in, `onChange(nextOverlays)` out. The shape is
// exactly what the backend stores (see backend/src/utils/textOverlays.js).
const SWATCHES = ['#ffffff', '#000000', '#fbbf24', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
const MAX_OVERLAYS = 8;

let counter = 0;
const newId = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

export function OverlayBox({ children, className = '' }) {
  return (
    <div className={`relative ${className}`} style={{ containerType: 'inline-size' }}>
      {children}
    </div>
  );
}

function ColorRow({ value, onChange, label }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1" role="group" aria-label={label}>
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`${label} ${c}`}
          className={`w-8 h-8 rounded-full shrink-0 border-2 ${value.toLowerCase() === c ? 'border-amber-500 scale-110' : 'border-white/30'}`}
          style={{ background: c }}
        />
      ))}
      <label className="w-8 h-8 rounded-full shrink-0 border-2 border-dashed border-white/50 overflow-hidden relative cursor-pointer" title="Custom colour">
        <span className="absolute inset-0" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          aria-label={`${label} picker`}
        />
      </label>
    </div>
  );
}

export default function TextOverlayEditor({ overlays, onChange, buttonClassName = '' }) {
  const rootRef = useRef(null);
  const dragRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const selected = overlays.find((o) => o.id === selectedId) || null;

  const update = (id, patch) => onChange(overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  function addText() {
    if (overlays.length >= MAX_OVERLAYS) return;
    const o = { id: newId(), text: 'Your text', x: 50, y: 50, size: 8, font: 'sans', color: '#ffffff', pill: false, pillColor: '#000000' };
    onChange([...overlays, o]);
    setSelectedId(o.id);
  }

  function remove(id) {
    onChange(overlays.filter((o) => o.id !== id));
    setSelectedId(null);
  }

  function onPointerDown(e, o) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { id: o.id, moved: false };
    setSelectedId(o.id);
  }
  function onPointerMove(e) {
    const d = dragRef.current;
    const root = rootRef.current;
    if (!d || !root) return;
    const r = root.getBoundingClientRect();
    if (!r.width || !r.height) return;
    d.moved = true;
    update(d.id, {
      x: Math.min(96, Math.max(4, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(96, Math.max(4, ((e.clientY - r.top) / r.height) * 100)),
    });
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  const panel = selected && typeof document !== 'undefined' && createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-[70] bg-zinc-900/95 backdrop-blur-xl text-white rounded-t-3xl border-t border-zinc-800 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3.5 max-h-[60dvh] overflow-y-auto"
      role="dialog"
      aria-label="Text options"
    >
      <textarea
        value={selected.text}
        onChange={(e) => update(selected.id, { text: e.target.value.slice(0, 120) })}
        rows={2}
        maxLength={120}
        autoFocus
        placeholder="Type something…"
        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-base font-extrabold tracking-tight placeholder-zinc-500 outline-none resize-none focus:ring-2 focus:ring-amber-500/60"
      />

      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-zinc-400 mb-1.5">Font</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {OVERLAY_FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => update(selected.id, { font: f.id })}
              className={`shrink-0 px-3.5 py-2 rounded-xl text-sm font-extrabold border ${
                selected.font === f.id ? 'bg-amber-500 text-black border-amber-500' : 'bg-zinc-800 text-white border-zinc-700'
              }`}
              style={{ fontFamily: overlayStyle({ font: f.id, x: 0, y: 0, size: 1 }).fontFamily }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-zinc-400 mb-1.5">Text colour</p>
        <ColorRow value={selected.color} onChange={(c) => update(selected.id, { color: c })} label="Text colour" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-zinc-400">Background pill</p>
          <button
            type="button"
            role="switch"
            aria-checked={selected.pill}
            onClick={() => update(selected.id, { pill: !selected.pill })}
            className={`w-12 h-7 rounded-full p-0.5 transition-colors ${selected.pill ? 'bg-amber-500' : 'bg-zinc-700'}`}
          >
            <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${selected.pill ? 'translate-x-5' : ''}`} />
          </button>
        </div>
        {selected.pill && <ColorRow value={selected.pillColor} onChange={(c) => update(selected.id, { pillColor: c })} label="Pill colour" />}
      </div>

      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-zinc-400 mb-1.5">Size</p>
        <input
          type="range"
          min={3}
          max={20}
          step={0.5}
          value={selected.size}
          onChange={(e) => update(selected.id, { size: Number(e.target.value) })}
          className="w-full accent-amber-500"
          aria-label="Text size"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => remove(selected.id)}
          className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl bg-zinc-800 text-red-400 font-extrabold text-sm"
        >
          <Trash2 className="w-4 h-4" strokeWidth={2.5} /> Delete
        </button>
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm"
        >
          <Check className="w-4 h-4" strokeWidth={3} /> Done
        </button>
      </div>
    </div>,
    document.body
  );

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-20 pointer-events-none"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {overlays.map((o) => (
        <span
          key={o.id}
          role="button"
          tabIndex={0}
          aria-label={`Edit text: ${o.text}`}
          onPointerDown={(e) => onPointerDown(e, o)}
          className={`absolute pointer-events-auto cursor-grab active:cursor-grabbing select-none touch-none ${
            o.id === selectedId ? 'outline outline-2 outline-dashed outline-amber-400 outline-offset-4' : ''
          }`}
          style={overlayStyle(o)}
        >
          {o.text}
        </span>
      ))}

      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={addText}
        disabled={overlays.length >= MAX_OVERLAYS}
        aria-label="Add text"
        className={`absolute pointer-events-auto top-3 right-3 h-10 px-3.5 rounded-full flex items-center gap-1.5 bg-black/65 backdrop-blur-md text-white font-extrabold text-sm disabled:opacity-40 ${buttonClassName}`}
      >
        <Type className="w-4 h-4" strokeWidth={2.75} />
        <Plus className="w-3.5 h-3.5 -ml-0.5" strokeWidth={3.5} />
        <span>Text</span>
      </button>
      {panel}
    </div>
  );
}
