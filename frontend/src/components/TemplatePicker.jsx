'use client';

import { useEffect, useRef, useState } from 'react';
import { Film, Music2, Search, X } from 'lucide-react';
import { TEMPLATES, TEMPLATE_CATEGORIES, fallbackPreviewFor, resolveTemplatePreview } from '@/lib/templates';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

// Solid badge colours per tag; unknown tags fall back to white.
const BADGE_STYLES = {
  Trending: 'bg-amber-500 text-black',
  Viral: 'bg-rose-500 text-white',
  AI: 'bg-violet-500 text-white',
  New: 'bg-emerald-500 text-black',
  Aesthetic: 'bg-sky-400 text-black',
};

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

function TemplateCard({ template, onClick }) {
  const cardRef = useRef(null);
  const videoRef = useRef(null);
  const reduceMotion = usePrefersReducedMotion();
  // The clip's src is only attached once the card is near the viewport, and
  // playback pauses again when it scrolls away. A grid of a dozen autoplaying
  // videos would otherwise blow past the number of hardware decoders a phone
  // has, and burn battery on cards nobody can see.
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  // The template's own preview, or a generic loop if it has none (or its file
  // fails to load). Only if the fallback fails too do we settle for a poster.
  const [source, setSource] = useState(() => resolveTemplatePreview(template));

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      setVisible(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setNear(true);
        setVisible(entry.isIntersecting);
      },
      { rootMargin: '160px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true; // React only sets the property; some browsers also want it before autoplay
    if (visible && !reduceMotion) v.play().catch(() => {});
    else v.pause();
  }, [visible, near, reduceMotion]);

  const showVideo = !!source.src && !failed;
  const playing = visible && !reduceMotion && showVideo;
  const usesLabel = `${compact.format(template.uses)} videos`;
  const clipsLabel = `${template.clipCount} clip${template.clipCount === 1 ? '' : 's'}`;

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={onClick}
      aria-label={`Use template ${template.title}. ${usesLabel}, ${clipsLabel}.`}
      className="relative block w-full aspect-[9/16] rounded-2xl overflow-hidden bg-zinc-900 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 active:scale-[0.98] transition-transform"
    >
      {showVideo ? (
        <video
          ref={videoRef}
          src={near ? source.src : undefined}
          poster={source.poster}
          autoPlay={!reduceMotion}
          loop
          muted
          playsInline
          preload="none"
          onError={() => {
            if (!source.fallback) setSource(fallbackPreviewFor(template));
            else setFailed(true);
          }}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover rounded-2xl"
        />
      ) : source.poster ? (
        <img src={source.poster} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-zinc-600">
          <Film className="w-8 h-8" aria-hidden="true" />
        </span>
      )}

      <span
        className={`absolute top-2 left-2 px-2.5 py-1 rounded-full text-[11px] font-extrabold leading-none shadow-md ${
          BADGE_STYLES[template.tag] || 'bg-white text-black'
        }`}
      >
        {template.tag}
      </span>

      <div className="absolute inset-x-0 bottom-0 bg-black/55 backdrop-blur-sm px-2.5 py-2">
        <p className="text-white text-sm font-bold leading-tight line-clamp-2">{template.title}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-white/85">
          <span>{usesLabel}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Film className="w-3 h-3" aria-hidden="true" strokeWidth={2.5} />
            {clipsLabel}
          </span>
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-white/85 min-w-0">
          <span className="flex items-end gap-px h-3 shrink-0" aria-hidden="true">
            {[0, 0.25, 0.5].map((delay) => (
              <span
                key={delay}
                className="w-[3px] h-full origin-bottom rounded-sm bg-amber-400 motion-reduce:animate-none"
                style={{
                  animation: playing ? `eq-bar 0.9s ease-in-out ${delay}s infinite` : 'none',
                  transform: playing ? undefined : 'scaleY(0.5)',
                }}
              />
            ))}
          </span>
          <Music2 className="w-3 h-3 shrink-0" aria-hidden="true" strokeWidth={2.5} />
          <span className="truncate">{template.sound}</span>
        </p>
      </div>
    </button>
  );
}

export default function TemplatePicker({
  onClose,
  category,
  setCategory,
  showSearch,
  setShowSearch,
  query,
  setQuery,
  onSelectTemplate,
  templates = TEMPLATES,
}) {
  const filtered = templates.filter((t) => {
    const matchesCategory = category === 'For You' || t.category === category;
    const matchesQuery = !query.trim() || t.title.toLowerCase().includes(query.trim().toLowerCase());
    return matchesCategory && matchesQuery;
  });

  return (
    <div className="absolute inset-0 bg-zinc-950 flex flex-col">
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 shrink-0">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close templates"
          className="w-10 h-10 -ml-2 flex items-center justify-center text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-full"
        >
          <X className="w-5 h-5" strokeWidth={2.5} />
        </button>
        <h2 className="text-white font-bold text-base">Templates</h2>
        <button
          type="button"
          onClick={() => setShowSearch((v) => !v)}
          aria-label="Search templates"
          aria-pressed={showSearch}
          className="w-10 h-10 -mr-2 flex items-center justify-center text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-full"
        >
          <Search className="w-5 h-5" strokeWidth={2.5} />
        </button>
      </div>

      {showSearch && (
        <div className="px-4 pb-3 shrink-0">
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates"
            aria-label="Search templates"
            className="w-full appearance-none bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2 text-base text-white placeholder-zinc-500 outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </div>
      )}

      <div role="tablist" aria-label="Template categories" className="flex gap-2 overflow-x-auto no-scrollbar px-4 pb-3 shrink-0">
        {TEMPLATE_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={category === c}
            onClick={() => setCategory(c)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              category === c ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {filtered.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-12">No templates match &quot;{query}&quot;.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((t) => (
              <TemplateCard key={t.id} template={t} onClick={() => onSelectTemplate(t)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
