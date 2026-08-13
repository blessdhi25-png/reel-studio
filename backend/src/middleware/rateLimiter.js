import rateLimit from 'express-rate-limit';

// Shared response shape for every limiter below, per the spec.
function tooManyRequestsHandler(_req, res) {
  res.status(429).json({ error: 'Too many requests, please try again later.' });
}

// Strict limiter for auth endpoints that are the highest-value targets for
// brute-forcing or abuse: login (password guessing), forgot-password
// (email-bombing a victim, or enumerating which emails have accounts),
// reset-password (guessing tokens), change-password (guessing the current
// password of a hijacked/left-open session). 8 requests per 15 minutes is
// generous for a real user (a few mistyped passwords, a couple of resend
// attempts) but too slow to be useful for automated guessing.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true, // adds RateLimit-* headers so a well-behaved client can see its remaining quota
  legacyHeaders: false,
  handler: tooManyRequestsHandler,
  // Rate limit by IP + a stable identifier together where available, not IP
  // alone — otherwise one person hammering their own forgotten password
  // from a shared/NAT'd IP (an office, a campus network) can lock out
  // everyone else behind that same IP. req.userId is only present on
  // change-password (mounted after requireAuth); login/forgot-password/
  // reset-password fall back to whatever identifying field is in the body.
  keyGenerator: (req) => `${req.ip}:${req.userId || req.body?.email || req.body?.username || ''}`,
});

// Standard limiter for everything else — generous enough that normal
// scrolling/liking/uploading during active use never comes close, but
// still bounds what a single client can do to the API in a 15-minute
// window.
export const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequestsHandler,
});

// AI Co-Pilot endpoints (routes/ai.js) call out to a paid LLM API on every
// request — unlike everything else behind standardLimiter, each hit here
// has a real per-call dollar cost, so this gets its own tighter budget
// regardless of how generous standardLimiter is. 20/hour comfortably
// covers someone iterating on tone/wording for a single post while still
// bounding worst-case spend from one account. Keyed by req.userId (these
// routes always sit behind requireAuth) rather than IP, since the goal is
// per-account cost control, not abuse prevention from a given network.
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequestsHandler,
  keyGenerator: (req) => req.userId || req.ip,
});
