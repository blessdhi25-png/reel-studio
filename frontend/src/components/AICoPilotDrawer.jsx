'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

function SparkleIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </svg>
  );
}

function XIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

function CheckIcon(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function SpinnerIcon(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin" {...props}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// Makes it unambiguous which path actually produced what's on screen —
// real Claude output vs. the offline template fallback (see the big
// comment above localGenerateCaptions/localRefineDraft for why the
// fallback exists at all). Without this, a misconfigured ANTHROPIC_API_KEY
// on the backend would silently look identical to a working AI
// integration, which makes that kind of setup bug very easy to miss.
function SourceBadge({ source }) {
  if (source === 'ai') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white bg-gradient-to-r from-purple-600 via-pink-500 to-cyan-500 px-2 py-0.5 rounded-full">
        <SparkleIcon className="w-2.5 h-2.5" /> Claude
      </span>
    );
  }
  if (source === 'local') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-full"
        title="The AI service wasn't reachable, so this is an offline suggestion instead of real generation."
      >
        Offline suggestion
      </span>
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const TONES = [
  { id: 'hype', label: 'Viral / Hype', emoji: '🔥' },
  { id: 'friendly', label: 'Engaging & Friendly', emoji: '💬' },
  { id: 'professional', label: 'Professional', emoji: '💼' },
  { id: 'minimalist', label: 'Minimalist', emoji: '⚡' },
  { id: 'storyteller', label: 'Storyteller', emoji: '📖' },
];

const REFINE_ACTIONS = [
  { id: 'grammar', label: 'Fix Grammar' },
  { id: 'punchier', label: 'Make it Punchier' },
  { id: 'emojis', label: 'Add Emojis' },
];

const VARIATION_META = [
  { id: 'short', label: 'Short', description: 'Quick and scannable' },
  { id: 'detailed', label: 'Detailed', description: 'Sets the scene' },
  { id: 'ctaHeavy', label: 'Call-to-Action', description: 'Drives comments & shares' },
];

/* ------------------------------------------------------------------ */
/* Generation — tries a real backend endpoint first (api.generateCaptions /
   api.refineDraft), and falls back to a local, template-based generator if
   that endpoint doesn't exist yet or the request fails. This project has
   no LLM integration wired up on the backend as of this component being
   built — the fallback below is a deterministic stand-in so the drawer is
   fully usable/demoable on its own, NOT genuine AI output. Swap in a real
   backend call (e.g. proxying to an LLM provider) behind
   api.generateCaptions / api.refineDraft and this component picks it up
   automatically with no changes needed here.                          */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for',
  'with', 'my', 'our', 'is', 'are', 'this', 'that', 'it', 'im', "i'm", 'we',
  'about', 'video', 'reel', 'post',
]);

function extractKeywords(topic, max = 5) {
  const words = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const seen = new Set();
  const out = [];
  for (const w of words) {
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
    if (out.length >= max) break;
  }
  return out;
}

function toHashtag(word) {
  return '#' + word.charAt(0).toUpperCase() + word.slice(1).replace(/[^a-z0-9]/gi, '');
}

const TONE_HASHTAGS = {
  hype: ['#Viral', '#FYP', '#Trending', '#MustWatch'],
  friendly: ['#Community', '#ForYou', '#GoodVibes'],
  professional: ['#Business', '#Growth', '#Insights'],
  minimalist: ['#Simple', '#Clean', '#LessIsMore'],
  storyteller: ['#Storytime', '#RealTalk', '#Journey'],
};

const TONE_CAPTION_TEXT = {
  hype: {
    short: (k) => `${k ? k.toUpperCase() : 'THIS'} just hit different 🔥 you're not ready`,
    detailed: (k) =>
      `Okay this might be my favorite one yet 🔥 ${k ? `everything about the ${k}` : 'everything about this'} came together perfectly. Watch till the end, you won't regret it.`,
    ctaHeavy: (k) =>
      `Drop a 🔥 if ${k ? `this ${k}` : 'this'} lived up to the hype. Tag someone who needs to see this RIGHT NOW.`,
  },
  friendly: {
    short: (k) => `Had way too much fun making this one 💬${k ? ` (${k}!)` : ''}`,
    detailed: (k) =>
      `Hey friends! Wanted to share ${k ? `a little bit about ${k}` : 'this with you'} today — this one means a lot to me. Let me know what you think in the comments, I read every single one 💬`,
    ctaHeavy: (k) =>
      `What do you think — should I make more like this? Comment "yes" below and let's chat 👇`,
  },
  professional: {
    short: (k) => `${k ? k.charAt(0).toUpperCase() + k.slice(1) : 'A quick'} update, straight to the point.`,
    detailed: (k) =>
      `${k ? `On ${k}` : 'On this topic'}: here's what I've learned and why it matters right now. Sharing this because it's shifted how I approach things.`,
    ctaHeavy: (k) =>
      `If ${k ? `${k} is` : 'this is'} relevant to your work, save this post and share it with your team.`,
  },
  minimalist: {
    short: (k) => `${k ? k.charAt(0).toUpperCase() + k.slice(1) : 'This.'}`,
    detailed: (k) => `${k ? k.charAt(0).toUpperCase() + k.slice(1) : 'A moment'}, captured. Nothing more to add.`,
    ctaHeavy: (k) => `Thoughts? ↓`,
  },
  storyteller: {
    short: (k) => `It started with ${k || 'an idea'}... 📖`,
    detailed: (k) =>
      `Let me tell you about ${k || 'how this one came together'}. It wasn't what I expected going in — but that's kind of the whole point. 📖`,
    ctaHeavy: (k) =>
      `Have you ever had a moment like this with ${k || 'something similar'}? Tell me your story below — I want to hear it.`,
  },
};

async function localGenerateCaptions({ topic, tone }) {
  // Small artificial delay so the loading-skeleton state reads naturally —
  // a real API call would have comparable latency.
  await new Promise((r) => setTimeout(r, 700));

  const keywords = extractKeywords(topic);
  const primaryKeyword = keywords[0] || '';
  const toneText = TONE_CAPTION_TEXT[tone] || TONE_CAPTION_TEXT.friendly;
  const toneEmoji = TONES.find((t) => t.id === tone)?.emoji || '✨';

  const captions = {
    short: toneText.short(primaryKeyword),
    detailed: toneText.detailed(primaryKeyword),
    ctaHeavy: toneText.ctaHeavy(primaryKeyword),
  };

  const keywordTags = keywords.map(toHashtag);
  const toneTags = TONE_HASHTAGS[tone] || TONE_HASHTAGS.friendly;
  const hashtags = Array.from(new Set([...keywordTags, ...toneTags, `${toneEmoji ? '' : ''}#ForYouPage`])).slice(0, 9);

  return { captions, hashtags, source: 'local' };
}

const REFINE_TRANSFORM = {
  grammar: (text) =>
    text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\bi\b/g, 'I')
      .replace(/(^\s*\w|[.!?]\s+\w)/g, (m) => m.toUpperCase())
      .replace(/([^.!?])$/, '$1.'),
  punchier: (text) =>
    text
      .trim()
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean)
      .map((s) => s.replace(/\.$/, '').replace(/^./, (c) => c.toUpperCase()))
      .join(' • ')
      .concat(text.trim() ? ' 🔥' : ''),
  emojis: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return trimmed;
    return `✨ ${trimmed} 🎬🔥`;
  },
};

async function localRefineDraft({ draft, action }) {
  await new Promise((r) => setTimeout(r, 600));
  const transform = REFINE_TRANSFORM[action] || ((t) => t);
  return { text: transform(draft), source: 'local' };
}

async function generateCaptions(payload) {
  if (typeof api.generateCaptions === 'function') {
    try {
      return await api.generateCaptions(payload);
    } catch {
      // Endpoint doesn't exist yet, or the request failed — fall through.
    }
  }
  return localGenerateCaptions(payload);
}

async function refineDraft(payload) {
  if (typeof api.refineDraft === 'function') {
    try {
      return await api.refineDraft(payload);
    } catch {
      // Endpoint doesn't exist yet, or the request failed — fall through.
    }
  }
  return localRefineDraft(payload);
}

/* ------------------------------------------------------------------ */
/* Drawer                                                              */
/* ------------------------------------------------------------------ */

/**
 * Slide-over AI Content Co-Pilot & Caption Assistant.
 *
 * Props:
 *  - open: boolean — controls visibility
 *  - onClose: () => void
 *  - onInsert: (text: string) => void — called with a caption/hashtag
 *    string the user chose to insert. The drawer never mutates the
 *    caller's caption state directly; it's entirely up to the parent how
 *    "insert" behaves (replace, append, insert at cursor, etc).
 *  - initialTopic?: string — optional starting value for the topic field
 *    (e.g. prefilled from an existing caption draft).
 */
export default function AICoPilotDrawer({ open, onClose, onInsert, initialTopic = '' }) {
  const [tab, setTab] = useState('generate'); // 'generate' | 'refine'

  // Generate tab state
  const [topic, setTopic] = useState(initialTopic);
  const [tone, setTone] = useState('friendly');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [captions, setCaptions] = useState(null); // { short, detailed, ctaHeavy }
  const [hashtags, setHashtags] = useState([]);
  const [genSource, setGenSource] = useState(null); // 'ai' | 'local'
  const [insertedKey, setInsertedKey] = useState(null); // which button just showed "Inserted"

  // Refine tab state
  const [draft, setDraft] = useState('');
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState(null);
  const [refined, setRefined] = useState(null);
  const [refineSource, setRefineSource] = useState(null); // 'ai' | 'local'
  const [refinedInserted, setRefinedInserted] = useState(false);

  const panelRef = useRef(null);

  // Reset transient state (not the user's typed input) whenever the drawer
  // is closed and reopened, so a stale generation from a previous session
  // doesn't linger.
  useEffect(() => {
    if (open) return;
    setGenError(null);
    setRefineError(null);
  }, [open]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.();
    }
    if (open) document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  async function handleGenerate() {
    if (!topic.trim() || generating) return;
    setGenerating(true);
    setGenError(null);
    setCaptions(null);
    setHashtags([]);
    setGenSource(null);
    try {
      const result = await generateCaptions({ topic: topic.trim(), tone });
      setCaptions(result.captions);
      setHashtags(result.hashtags || []);
      setGenSource(result.source || 'local');
    } catch (err) {
      setGenError(err.message || 'Could not generate captions right now.');
    } finally {
      setGenerating(false);
    }
  }

  function handleInsertCaption(key, text) {
    onInsert?.(text);
    setInsertedKey(key);
    setTimeout(() => setInsertedKey((k) => (k === key ? null : k)), 1600);
  }

  function handleInsertHashtags() {
    if (!hashtags.length) return;
    onInsert?.(hashtags.join(' '));
    setInsertedKey('hashtags');
    setTimeout(() => setInsertedKey((k) => (k === 'hashtags' ? null : k)), 1600);
  }

  async function handleRefine(action) {
    if (!draft.trim() || refining) return;
    setRefining(true);
    setRefineError(null);
    setRefined(null);
    setRefinedInserted(false);
    setRefineSource(null);
    try {
      const result = await refineDraft({ draft: draft.trim(), action });
      setRefined(result.text);
      setRefineSource(result.source || 'local');
    } catch (err) {
      setRefineError(err.message || 'Could not refine this draft right now.');
    } finally {
      setRefining(false);
    }
  }

  function handleInsertRefined() {
    if (!refined) return;
    onInsert?.(refined);
    setRefinedInserted(true);
    setTimeout(() => setRefinedInserted(false), 1600);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close AI Co-Pilot"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="AI Content Co-Pilot"
        className="relative w-full sm:w-[440px] h-full bg-zinc-900/95 backdrop-blur-xl border-l border-zinc-800 text-white flex flex-col shadow-2xl animate-[slideInRight_0.28s_cubic-bezier(0.16,1,0.3,1)]"
      >
        {/* Header */}
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-cyan-500 flex items-center justify-center shadow-[0_2px_10px_rgba(219,39,119,0.4)]">
                <SparkleIcon />
              </span>
              <div>
                <h2 className="text-base font-bold text-white leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">AI Co-Pilot</h2>
                <p className="text-[11px] text-zinc-400 leading-tight">Captions & hashtags, instantly</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-2 -m-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              <XIcon />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 p-1 bg-zinc-800/60 border border-zinc-800 rounded-xl">
            {[
              { id: 'generate', label: 'Generate' },
              { id: 'refine', label: 'Improve My Draft' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                  tab === t.id
                    ? 'bg-gradient-to-r from-purple-600 via-pink-500 to-cyan-500 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {tab === 'generate' ? (
            <>
              {/* Topic input */}
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  What's this video about?
                </label>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Drop a quick brief or a few bullet points — e.g. 'morning routine, cold plunge, then coffee on the balcony'"
                  rows={3}
                  className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500/50 transition-all resize-none placeholder:text-zinc-500"
                />
              </div>

              {/* Tone selector */}
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  Tone
                </label>
                <div className="flex flex-wrap gap-2">
                  {TONES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTone(t.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                        tone === t.id
                          ? 'bg-gradient-to-r from-purple-600 via-pink-500 to-cyan-500 border-transparent text-white shadow-md'
                          : 'bg-zinc-800/60 border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-600'
                      }`}
                    >
                      <span>{t.emoji}</span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate CTA */}
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!topic.trim() || generating}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-cyan-500 text-white font-bold text-sm shadow-[0_4px_20px_rgba(219,39,119,0.35)] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:hover:brightness-100 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
              >
                {generating ? (
                  <>
                    <SpinnerIcon /> Generating…
                  </>
                ) : (
                  <>
                    <SparkleIcon className="w-4 h-4" />
                    <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">Generate Captions & Hashtags</span>
                  </>
                )}
              </button>

              {genError && <p className="text-xs text-red-400">{genError}</p>}

              {/* Loading skeletons */}
              {generating && (
                <div className="space-y-3">
                  {VARIATION_META.map((v) => (
                    <div key={v.id} className="rounded-2xl border border-zinc-800 bg-zinc-800/40 p-4 space-y-2 animate-pulse">
                      <div className="h-3 w-20 bg-zinc-700 rounded-full" />
                      <div className="h-3 w-full bg-zinc-700 rounded-full" />
                      <div className="h-3 w-3/4 bg-zinc-700 rounded-full" />
                    </div>
                  ))}
                </div>
              )}

              {/* Caption variations */}
              {!generating && captions && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Pick a variation
                    </h3>
                    <SourceBadge source={genSource} />
                  </div>
                  {VARIATION_META.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-2xl border border-zinc-800 bg-zinc-800/40 p-4 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider bg-gradient-to-r from-purple-600 via-pink-500 to-cyan-500 bg-clip-text text-transparent">
                          {v.label}
                        </span>
                        <span className="text-[11px] text-zinc-500">{v.description}</span>
                      </div>
                      <p className="text-sm text-zinc-100 leading-relaxed">{captions[v.id]}</p>
                      <button
                        type="button"
                        onClick={() => handleInsertCaption(v.id, captions[v.id])}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-700/60 hover:bg-zinc-700 text-xs font-semibold text-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                      >
                        {insertedKey === v.id ? (
                          <>
                            <CheckIcon className="text-green-400" /> Inserted
                          </>
                        ) : (
                          'Insert into Caption'
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Hashtags */}
              {!generating && hashtags.length > 0 && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-800/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Trending Hashtags
                    </h3>
                    <button
                      type="button"
                      onClick={handleInsertHashtags}
                      className="flex items-center gap-1.5 text-xs font-semibold text-white bg-zinc-700/60 hover:bg-zinc-700 px-3 py-1.5 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                    >
                      {insertedKey === 'hashtags' ? (
                        <>
                          <CheckIcon className="text-green-400" /> Inserted
                        </>
                      ) : (
                        'Insert All'
                      )}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {hashtags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleInsertCaption(tag, tag)}
                        className="text-xs font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-full hover:bg-cyan-500/20 transition-all"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Refine tab */}
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  Paste your draft caption
                </label>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Paste what you've already written and I'll punch it up…"
                  rows={4}
                  className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500/50 transition-all resize-none placeholder:text-zinc-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  What should I do with it?
                </label>
                <div className="flex flex-wrap gap-2">
                  {REFINE_ACTIONS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      disabled={!draft.trim() || refining}
                      onClick={() => handleRefine(a.id)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold border border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:text-white hover:border-zinc-600 transition-all disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {refineError && <p className="text-xs text-red-400">{refineError}</p>}

              {refining && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-800/40 p-4 space-y-2 animate-pulse">
                  <div className="h-3 w-full bg-zinc-700 rounded-full" />
                  <div className="h-3 w-5/6 bg-zinc-700 rounded-full" />
                  <div className="h-3 w-2/3 bg-zinc-700 rounded-full" />
                </div>
              )}

              {!refining && refined && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-800/40 p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider bg-gradient-to-r from-purple-600 via-pink-500 to-cyan-500 bg-clip-text text-transparent">
                      Refined
                    </span>
                    <SourceBadge source={refineSource} />
                  </div>
                  <p className="text-sm text-zinc-100 leading-relaxed">{refined}</p>
                  <button
                    type="button"
                    onClick={handleInsertRefined}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-700/60 hover:bg-zinc-700 text-xs font-semibold text-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                  >
                    {refinedInserted ? (
                      <>
                        <CheckIcon className="text-green-400" /> Inserted
                      </>
                    ) : (
                      'Insert into Caption'
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
