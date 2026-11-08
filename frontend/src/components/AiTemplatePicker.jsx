'use client';

import { useEffect, useRef, useState } from 'react';
import { Film, Music2, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { TEMPLATES } from '@/lib/templates';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

// Offline / pre-seed fallback so the tab is never empty: the catalog's AI entries.
// Fallback rows have no real pipeline behind them, so tapping one will surface the server's 404.
const FALLBACK = TEMPLATES.filter((t) => t.category === 'AI').map((t) => ({
  id: t.id, title: t.title, category: t.category, previewUrl: t.previewUrl, uses: t.uses, soundTitle: t.sound, creditsCost: 1,
}));

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    setReduce(mq.matches);
    const onChange = (e) => setReduce(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduce;
}

export function AiBadge({ className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-500 text-white text-[11px] font-extrabold leading-none tracking-wide shadow-[0_0_14px_3px_rgba(139,92,246,0.7)] ring-1 ring-violet-300/60 ${className}`}
    >
      <Sparkles className="w-3 h-3" aria-hidden="true" strokeWidth={2.5} />
      AI
    </span>
  );
}

function AiCard({ template, onClick }) {
  const cardRef = useRef(null);
  const videoRef = useRef(null);
  const reduceMotion = usePrefersReducedMotion();
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);

  // Only decode what's on (or near) screen — a grid of autoplaying videos
  // otherwise exceeds a phone's hardware decoder count.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      setVisible(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setNear(true);
        setVisible(e.isIntersecting);
      },
      { rootMargin: '160px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    if (visible && !reduceMotion) v.play().catch(() => {});
    else v.pause();
  }, [visible, near, reduceMotion]);

  const isImage = /\.(webp|gif|png|jpe?g)$/i.test(template.previewUrl || '');
  const usesLabel = `${compact.format(template.uses || 0)} videos`;
  const playing = visible && !reduceMotion && !failed;

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={onClick}
      aria-label={`${template.title}, AI template. ${usesLabel}. ${template.creditsCost} credit.`}
      className="relative block w-full aspect-[9/16] rounded-2xl overflow-hidden bg-zinc-900 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 active:scale-[0.98] transition-transform"
    >
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={template.previewUrl} alt="" className="w-full h-full object-cover rounded-2xl" />
      ) : failed ? (
        <span className="absolute inset-0 flex items-center justify-center text-zinc-600">
          <Film className="w-8 h-8" aria-hidden="true" />
        </span>
      ) : (
        <video
          ref={videoRef}
          src={near ? template.previewUrl : undefined}
          autoPlay={!reduceMotion}
          loop
          muted
          playsInline
          preload="none"
          onError={() => setFailed(true)}
          aria-hidden="true"
          className="w-full h-full object-cover rounded-2xl"
        />
      )}

      <AiBadge className="absolute top-2 left-2" />

      <div className="absolute inset-x-0 bottom-0 bg-black/55 backdrop-blur-sm px-2.5 py-2">
        <p className="text-white text-sm font-bold leading-tight line-clamp-2">{template.title}</p>
        <p className="mt-1 text-[11px] font-semibold text-white/85">{usesLabel}</p>
        {template.soundTitle && (
          <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-white/85 min-w-0">
            <span className="flex items-end gap-px h-3 shrink-0" aria-hidden="true">
              {[0, 0.25, 0.5].map((d) => (
                <span
                  key={d}
                  className="w-[3px] h-full origin-bottom rounded-sm bg-amber-400"
                  style={{ animation: playing ? `eq-bar 0.9s ease-in-out ${d}s infinite` : 'none', transform: playing ? undefined : 'scaleY(0.5)' }}
                />
              ))}
            </span>
            <Music2 className="w-3 h-3 shrink-0" aria-hidden="true" strokeWidth={2.5} />
            <span className="truncate">{template.soundTitle}</span>
          </p>
        )}
      </div>
    </button>
  );
}

// Grid of AI templates (live from GET /ai/templates). `query` filters by title.
export default function AiTemplatePicker({ onSelectTemplate, query = '' }) {
  const [templates, setTemplates] = useState(null);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getAiTemplates()
      .then((d) => {
        if (cancelled) return;
        const list = d?.templates || [];
        if (list.length) setTemplates(list);
        else {
          setTemplates(FALLBACK);
          setUsingFallback(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setTemplates(FALLBACK);
        setUsingFallback(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const shown = (templates || []).filter((t) => !q || t.title.toLowerCase().includes(q));

  if (templates === null) {
    return (
      <div className="grid grid-cols-2 gap-3 animate-pulse" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="aspect-[9/16] rounded-2xl bg-zinc-900" />
        ))}
      </div>
    );
  }

  return (
    <>
      {usingFallback && (
        <p className="text-[11px] text-zinc-500 px-1 pb-2">Showing the built-in catalog — live AI templates couldn&apos;t be loaded.</p>
      )}
      {shown.length === 0 ? (
        <p className="text-zinc-500 text-sm text-center py-12">No AI templates match &quot;{query}&quot;.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {shown.map((t) => (
            <AiCard key={t.id} template={t} onClick={() => onSelectTemplate(t)} />
          ))}
        </div>
      )}
    </>
  );
}
