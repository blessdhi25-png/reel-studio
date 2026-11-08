'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Download, ImagePlus, Loader2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { AiBadge } from '@/components/AiTemplatePicker';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp';

// The backend call is a single request (no streaming), so these steps advance
// on a timer as an estimate of the pipeline; the last one holds until the
// response arrives. They are indicative, not live telemetry.
const STEPS = [
  { label: 'Analyzing face...', at: 0 },
  { label: 'Applying neural weights...', at: 6000 },
  { label: 'Rendering frames...', at: 16000 },
];

export default function AiGenerationModal({ template, onClose, onUseInStudio }) {
  const fileInputRef = useRef(null);
  const abortRef = useRef(null);
  const [photo, setPhoto] = useState(null); // File
  const [photoUrl, setPhotoUrl] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | generating | done | error
  const [step, setStep] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { videoUrl, creditsRemaining }
  const [credits, setCredits] = useState(null);
  const [handoff, setHandoff] = useState(false);

  const cost = template.creditsCost || 1;
  const generating = phase === 'generating';

  useEffect(() => {
    api.getAiCredits().then((d) => setCredits(d.credits)).catch(() => {});
  }, []);

  // Scroll lock + Escape (disabled mid-generation: the credit is already spent
  // and closing would throw the result away).
  const generatingRef = useRef(false);
  generatingRef.current = generating;
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !generatingRef.current && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      abortRef.current?.abort();
    };
  }, [onClose]);

  useEffect(() => () => photoUrl && URL.revokeObjectURL(photoUrl), [photoUrl]);

  useEffect(() => {
    if (!generating) return undefined;
    setStep(0);
    const timers = STEPS.slice(1).map((s, i) => setTimeout(() => setStep(i + 1), s.at));
    return () => timers.forEach(clearTimeout);
  }, [generating]);

  function pickPhoto(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!ACCEPT.split(',').includes(f.type)) return setError('Use a JPEG, PNG or WebP photo.');
    if (f.size > MAX_BYTES) return setError('That photo is over 8 MB — pick a smaller one.');
    setError(null);
    setPhase('idle');
    setPhoto(f);
    setPhotoUrl(URL.createObjectURL(f));
  }

  async function generate() {
    if (!photo || generating) return;
    setError(null);
    setPhase('generating');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const body = new FormData();
      body.append('image', photo);
      body.append('templateId', template.id);
      const token = window.localStorage.getItem('token');
      const res = await fetch('/api/ai/generate-template', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          res.status === 402 ? 'You’re out of AI credits.' :
          res.status === 401 ? 'Your session expired — log in again.' :
          data.error || 'Generation failed. Your credit was not used.';
        throw new Error(msg);
      }
      setResult(data);
      setCredits(data.creditsRemaining);
      setPhase('done');
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Generation failed.');
      setPhase('error');
      api.getAiCredits().then((d) => setCredits(d.credits)).catch(() => {}); // reflect any refund
    }
  }

  async function useInStudio() {
    setHandoff(true);
    try {
      // Pull the MP4 into a File so the studio can publish it like any recording.
      const blob = await (await fetch(result.videoUrl)).blob();
      onUseInStudio?.(new File([blob], `${template.title.replace(/\W+/g, '-').toLowerCase()}.mp4`, { type: blob.type || 'video/mp4' }));
    } catch {
      setError('Couldn’t load the video into the studio — use Download instead.');
      setHandoff(false);
    }
  }

  const noCredits = credits !== null && credits < cost;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="ai-gen-title">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={generating ? undefined : onClose} aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-md max-h-[92dvh] overflow-y-auto bg-neutral-900 border-t border-neutral-800 rounded-t-3xl shadow-2xl">
        <div className="px-5 pt-3 pb-32">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-700" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <AiBadge />
              <h2 id="ai-gen-title" className="mt-2 text-lg font-extrabold text-white leading-tight">{template.title}</h2>
              {credits !== null && (
                <p className="text-xs font-semibold text-neutral-400 mt-1">{credits} credit{credits === 1 ? '' : 's'} left</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={generating}
              aria-label="Close"
              className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-neutral-800 text-white disabled:opacity-30"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {phase === 'done' && result ? (
            <>
              <video src={result.videoUrl} controls autoPlay loop playsInline className="w-full max-h-[50dvh] rounded-2xl bg-black object-contain" />
              <p className="mt-3 flex items-center gap-2 text-sm font-bold text-emerald-400">
                <Check className="w-4 h-4" /> Your AI video is ready
              </p>
              {error && <p className="mt-2 text-sm font-semibold text-red-400">{error}</p>}
              {onUseInStudio && (
                <button
                  type="button"
                  onClick={useInStudio}
                  disabled={handoff}
                  className="mt-4 w-full bg-amber-500 text-black font-extrabold py-3.5 rounded-xl disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {handoff && <Loader2 className="w-4 h-4 animate-spin" />} Edit &amp; Publish in Studio
                </button>
              )}
              <a
                href={result.videoUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2.5 w-full bg-neutral-800 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" /> Download MP4
              </a>
            </>
          ) : (
            <>
              <div className="flex gap-3">
                <div className="w-24 shrink-0 aspect-[9/16] rounded-xl overflow-hidden bg-zinc-800">
                  <video src={template.previewUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" aria-label={`${template.title} preview`} />
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={generating}
                  className="flex-1 relative rounded-xl border-2 border-dashed border-neutral-700 hover:border-amber-500/60 overflow-hidden flex flex-col items-center justify-center text-center p-3 text-neutral-400 disabled:opacity-60 min-h-[10rem]"
                >
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} alt="Your selected photo" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <>
                      <ImagePlus className="w-7 h-7 mb-2 text-amber-500" aria-hidden="true" />
                      <span className="text-sm font-bold text-white">Upload your selfie or portrait</span>
                      <span className="text-xs mt-1">Front-facing, well lit · JPEG, PNG or WebP · max 8 MB</span>
                    </>
                  )}
                  {photoUrl && !generating && (
                    <span className="absolute bottom-2 inset-x-2 rounded-lg bg-black/70 text-white text-xs font-bold py-1">Tap to change</span>
                  )}
                </button>
                <input ref={fileInputRef} type="file" accept={ACCEPT} className="hidden" onChange={pickPhoto} />
              </div>

              {generating && (
                <ol className="mt-4 space-y-2" aria-live="polite">
                  {STEPS.map((s, i) => (
                    <li key={s.label} className={`flex items-center gap-2.5 text-sm font-bold ${i <= step ? 'text-white' : 'text-neutral-600'}`}>
                      {i < step ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : i === step ? (
                        <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                      ) : (
                        <span className="w-4 h-4 rounded-full border border-neutral-700" />
                      )}
                      {s.label}
                    </li>
                  ))}
                  <li className="text-xs font-medium text-neutral-500 pt-1">This can take a minute or two — keep this open.</li>
                </ol>
              )}

              {error && <p className="mt-3 text-sm font-semibold text-red-400" role="alert">{error}</p>}
              {noCredits && !generating && <p className="mt-3 text-sm font-semibold text-amber-400">You need {cost} credit to generate this video.</p>}

              <button
                type="button"
                onClick={generate}
                disabled={!photo || generating || noCredits}
                className="mt-4 w-full bg-amber-500 text-black font-extrabold py-3.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition-transform"
              >
                {generating ? 'Generating…' : phase === 'error' ? `Try again (${cost} Credit)` : `Generate AI Video (${cost} Credit${cost === 1 ? '' : 's'})`}
              </button>
              <p className="mt-2 text-center text-[11px] text-neutral-500">Your photo is sent to our AI provider to create the video and isn&apos;t stored. Failed generations are refunded.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
