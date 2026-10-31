'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SPEEDS = [0.5, 1, 1.5, 2];

function Switch({ checked }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-amber-500' : 'bg-neutral-600'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </span>
  );
}

function Icon({ children }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-white/90"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function Row({ icon, label, hint, onClick, right, disabled, role, checked }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === 'switch' ? checked : undefined}
      disabled={disabled}
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left active:bg-white/10 hover:bg-white/5 disabled:opacity-50 transition-colors"
    >
      {icon}
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold text-white">{label}</span>
        {hint && <span className="block text-xs text-neutral-400 mt-0.5">{hint}</span>}
      </span>
      {right}
    </button>
  );
}

// TikTok-style long-press action sheet. Purely presentational: all state
// (speed, toggles) is owned by VideoCard / the shared player-prefs store and
// passed in, so the menu itself stays dumb and easy to reason about.
export default function VideoLongPressMenu({
  onClose,
  speed,
  onSpeedChange,
  clearDisplay,
  onClearDisplayChange,
  autoScroll,
  onAutoScrollChange,
  backgroundAudio,
  onBackgroundAudioChange,
  onDownload,
  downloading = false,
  onTranslate,
  canTranslate = true,
  reasons = [],
}) {
  const [view, setView] = useState('main'); // 'main' | 'why'
  const openedAtRef = useRef(0);

  useEffect(() => {
    openedAtRef.current = Date.now();
    const onKey = (e) => {
      if (e.key === 'Escape') (view === 'why' ? setView('main') : onClose());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [view, onClose]);

  // The finger/mouse release that ends the long-press lands on the backdrop
  // (the sheet mounts while the press is still down) and would otherwise
  // dismiss the menu instantly. Ignore backdrop taps for a moment.
  function handleBackdrop() {
    if (Date.now() - openedAtRef.current < 450) return;
    onClose();
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Video options"
      // Keep taps/long-presses inside the sheet from reaching the feed's
      // handlers underneath (React synthetic events bubble through portals).
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleBackdrop} />

      <div className="relative w-full max-w-md max-h-[85dvh] overflow-y-auto bg-neutral-900 text-white rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl animate-in slide-in-from-bottom animate-sheet-up">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" aria-hidden="true" />

        {view === 'why' ? (
          <div>
            <button
              type="button"
              onClick={() => setView('main')}
              className="flex items-center gap-1 text-sm text-neutral-300 mb-3 px-1"
            >
              ‹ Back
            </button>
            <p className="text-lg font-bold px-1">Why you're seeing this post</p>
            <ul className="mt-3 space-y-2">
              {reasons.map((r) => (
                <li key={r} className="flex gap-3 rounded-xl bg-white/5 px-3 py-3 text-sm text-neutral-100">
                  <span aria-hidden="true">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 px-1 text-xs text-neutral-400">
              Your feed mixes who you follow, what's popular, and what's new. You can adjust it from the feed tuning controls.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <Row
              icon={
                <Icon>
                  <path d="M12 3v12" />
                  <path d="m7 11 5 5 5-5" />
                  <path d="M5 21h14" />
                </Icon>
              }
              label={downloading ? 'Preparing download…' : 'Download'}
              hint={downloading ? 'Adding the ClipPulse watermark — keep this tab open' : 'Saved with the ClipPulse watermark'}
              onClick={onDownload}
              disabled={downloading}
            />

            <div className="flex items-center gap-3 px-3 py-3">
              <Icon>
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l2.5 2" />
                <path d="M9.5 2.5h5" />
              </Icon>
              <span className="text-[15px] font-semibold flex-1">Speed</span>
              <div className="flex rounded-lg bg-white/10 p-0.5" role="group" aria-label="Playback speed">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={speed === s}
                    onClick={() => onSpeedChange(s)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors ${
                      speed === s ? 'bg-white text-black' : 'text-neutral-300'
                    }`}
                  >
                    {s.toFixed(1)}x
                  </button>
                ))}
              </div>
            </div>

            <Row
              role="switch"
              checked={clearDisplay}
              icon={
                <Icon>
                  <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
                </Icon>
              }
              label="Clear display"
              hint="Hide buttons and captions. Tap the video to bring them back."
              onClick={() => onClearDisplayChange(!clearDisplay)}
              right={<Switch checked={clearDisplay} />}
            />

            <Row
              role="switch"
              checked={autoScroll}
              icon={
                <Icon>
                  <path d="M12 4v13" />
                  <path d="m6 12 6 6 6-6" />
                  <path d="M6 21h12" />
                </Icon>
              }
              label="Auto scroll"
              hint="Move to the next video when this one ends"
              onClick={() => onAutoScrollChange(!autoScroll)}
              right={<Switch checked={autoScroll} />}
            />

            <Row
              icon={
                <Icon>
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M7 12h4M7 15h7M15 12h2" />
                </Icon>
              }
              label="Captions and translation"
              hint={canTranslate ? 'Translate this caption' : 'No caption on this post'}
              disabled={!canTranslate}
              onClick={onTranslate}
              right={<span className="text-neutral-400" aria-hidden="true">›</span>}
            />

            <Row
              role="switch"
              checked={backgroundAudio}
              icon={
                <Icon>
                  <path d="M9 18V6l10-2v12" />
                  <circle cx="6.5" cy="18" r="2.5" />
                  <circle cx="16.5" cy="16" r="2.5" />
                </Icon>
              }
              label="Background audio"
              hint="Keep playing sound when the app is in the background"
              onClick={() => onBackgroundAudioChange(!backgroundAudio)}
              right={<Switch checked={backgroundAudio} />}
            />

            <Row
              icon={
                <Icon>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5M12 8h.01" />
                </Icon>
              }
              label="Why this post"
              onClick={() => setView('why')}
              right={<span className="text-neutral-400" aria-hidden="true">›</span>}
            />
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-xl bg-white/10 py-3 text-[15px] font-semibold active:bg-white/20"
        >
          Close
        </button>
      </div>
    </div>,
    document.body
  );
}
