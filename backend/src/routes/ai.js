import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// Haiku by default — this is short-form caption/hashtag text, not a task
// that needs a frontier model, and every request here has a real per-call
// cost (see aiLimiter). Override via env if a different tradeoff is
// wanted; nothing else in this file needs to change.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const TONE_LABELS = {
  hype: 'Viral / Hype — energetic, urgent, exclamation-heavy',
  friendly: 'Engaging & Friendly — warm, conversational, first-person',
  professional: 'Professional — polished, credible, minimal slang',
  minimalist: 'Minimalist — short, understated, few words',
  storyteller: 'Storyteller — narrative, sets a scene, reflective',
};

// Strips a ```json ... ``` (or bare ```) fence if the model wraps its
// answer in one despite being asked not to — cheap insurance rather than
// a real parsing strategy, since models do this inconsistently.
function stripCodeFence(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

async function callClaude({ system, messages, maxTokens = 700 }) {
  if (!ANTHROPIC_API_KEY) {
    const err = new Error('AI Co-Pilot is not configured on this server (missing ANTHROPIC_API_KEY).');
    err.status = 503;
    throw err;
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error('[ai] Anthropic API error:', res.status, body);
    const err = new Error(body?.error?.message || 'The AI service is temporarily unavailable.');
    err.status = res.status === 429 ? 429 : 502;
    throw err;
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  if (!text) {
    const err = new Error('The AI service returned an empty response.');
    err.status = 502;
    throw err;
  }

  return text;
}

// POST /api/v1/ai/generate-captions
// body: { topic: string, tone?: string }
// -> { captions: { short, detailed, ctaHeavy }, hashtags: string[], source: 'ai' }
router.post('/generate-captions', requireAuth, aiLimiter, asyncHandler(async (req, res) => {
  const topic = (req.body?.topic || '').trim();
  const toneId = TONE_LABELS[req.body?.tone] ? req.body.tone : 'friendly';

  if (!topic) {
    return res.status(400).json({ error: 'topic is required' });
  }
  if (topic.length > 600) {
    return res.status(400).json({ error: 'topic is too long (max 600 characters)' });
  }

  const system = `You write short-form social video captions and hashtags for a TikTok/Reels-style app.
Given a creator's brief and a requested tone, respond with ONLY a single JSON object — no markdown, no code fence, no commentary before or after — matching exactly this shape:
{"short": string, "detailed": string, "ctaHeavy": string, "hashtags": string[]}

Rules:
- "short": under 80 characters, punchy, scannable.
- "detailed": 2-3 sentences, sets context, still casual social-caption voice.
- "ctaHeavy": ends with an explicit call to action (comment, share, tag a friend, save, follow — pick what fits).
- "hashtags": 6-9 relevant hashtags as an array of strings, each starting with "#", no spaces inside a tag, mixing broad-reach tags with a couple specific to the topic.
- Match the requested tone consistently across all three captions.
- Never invent specific facts, names, numbers, or claims the brief didn't give you.
- Output raw JSON only — it will be parsed programmatically.`;

  const userMessage = `Brief: ${topic}\nTone: ${TONE_LABELS[toneId]}`;

  const raw = await callClaude({
    system,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 700,
  });

  let parsed;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch (err) {
    console.error('[ai] Failed to parse generate-captions response as JSON:', raw);
    const parseErr = new Error('The AI service returned an unexpected response.');
    parseErr.status = 502;
    throw parseErr;
  }

  const { short, detailed, ctaHeavy, hashtags } = parsed || {};
  if (
    typeof short !== 'string' ||
    typeof detailed !== 'string' ||
    typeof ctaHeavy !== 'string' ||
    !Array.isArray(hashtags)
  ) {
    const shapeErr = new Error('The AI service returned an unexpected response shape.');
    shapeErr.status = 502;
    throw shapeErr;
  }

  res.json({
    captions: { short, detailed, ctaHeavy },
    hashtags: hashtags.filter((t) => typeof t === 'string').slice(0, 10),
    source: 'ai',
  });
}));

const REFINE_INSTRUCTIONS = {
  grammar: 'Fix grammar, spelling, and punctuation. Keep the meaning, tone, and length essentially the same — this is a proofread, not a rewrite.',
  punchier: 'Rewrite this to be punchier and more scroll-stopping — tighter sentences, stronger opening line, cut filler words. Keep it roughly the same length or shorter.',
  emojis: 'Add well-placed emojis that fit the content naturally. Do not change the wording otherwise — this is emoji placement only.',
};

// POST /api/v1/ai/refine-draft
// body: { draft: string, action: 'grammar' | 'punchier' | 'emojis' }
// -> { text: string, source: 'ai' }
router.post('/refine-draft', requireAuth, aiLimiter, asyncHandler(async (req, res) => {
  const draft = (req.body?.draft || '').trim();
  const action = req.body?.action;

  if (!draft) {
    return res.status(400).json({ error: 'draft is required' });
  }
  if (draft.length > 2200) {
    return res.status(400).json({ error: 'draft is too long (max 2200 characters)' });
  }
  if (!REFINE_INSTRUCTIONS[action]) {
    return res.status(400).json({ error: 'action must be one of: grammar, punchier, emojis' });
  }

  const system = `You edit short-form social video captions. Apply exactly one instruction to the caption you're given and respond with ONLY the revised caption text — no quotes, no markdown, no preamble, no explanation of what you changed.`;

  const userMessage = `Instruction: ${REFINE_INSTRUCTIONS[action]}\n\nCaption:\n${draft}`;

  const raw = await callClaude({
    system,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 500,
  });

  res.json({ text: stripCodeFence(raw), source: 'ai' });
}));

export default router;
