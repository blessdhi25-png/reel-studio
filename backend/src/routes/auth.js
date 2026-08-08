import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../config/db.js';
import { sendMail } from '../config/mailer.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between resends

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:4000'}/api/v1/auth/google/callback`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Used to verify One-Tap/GSI id_tokens (POST /google below). The redirect
// flow (GET /google/callback) doesn't need this client — it exchanges the
// code for tokens via plain REST calls instead — but id_token verification
// specifically needs a signature check against Google's rotating public
// keys, which this library handles correctly instead of us reimplementing
// JWKS verification by hand.
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

function signToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

// Short-lived, self-verifying OAuth state — avoids needing server-side
// session storage just to guard against CSRF on the Google redirect.
function signOAuthState() {
  return jwt.sign({ purpose: 'google_oauth_state' }, process.env.JWT_SECRET, { expiresIn: '10m' });
}

function verifyOAuthState(state) {
  try {
    const payload = jwt.verify(state, process.env.JWT_SECRET);
    return payload.purpose === 'google_oauth_state';
  } catch {
    return false;
  }
}

// Shared by both Google auth paths (redirect callback and One-Tap/GSI) so
// find-or-create and account-status handling can't drift between them.
// `profile` is normalized to { sub, email, name, picture, email_verified }
// regardless of which Google API it came from.
async function findOrCreateGoogleUser(profile) {
  let user = await prisma.user.findUnique({ where: { googleId: profile.sub } });

  if (!user) {
    // Link to an existing email/password account if one matches, so
    // someone who registered with email first doesn't end up with two
    // accounts when they later use Google sign-in.
    const existingByEmail = await prisma.user.findUnique({ where: { email: profile.email } });
    if (existingByEmail) {
      user = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: { googleId: profile.sub, emailVerified: true },
      });
    } else {
      const username = await generateUniqueUsername(profile.email, profile.name);
      user = await prisma.user.create({
        data: {
          username,
          email: profile.email,
          googleId: profile.sub,
          displayName: profile.name || username,
          avatarUrl: profile.picture || null,
          emailVerified: true,
        },
      });
    }
  }

  return user;
}

// Returns an error code string if the account can't sign in right now, or
// null if it's fine to proceed.
function blockedReasonFor(user) {
  if (user.accountStatus === 'banned') return 'account_banned';
  if (user.accountStatus === 'suspended') return 'account_suspended';
  return null;
}

async function generateUniqueUsername(email, name) {
  const base =
    (name || email.split('@')[0])
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20) || 'user';
  let candidate = base;
  let suffix = 0;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
  return candidate;
}

async function sendVerificationCode(user) {
  const code = generateCode();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificationCode: code,
      emailVerificationExpires: new Date(Date.now() + CODE_EXPIRY_MS),
    },
  });
  await sendMail({
    to: user.email,
    subject: 'Verify your Bledhi account',
    text: `Your verification code is ${code}. It expires in 15 minutes.`,
    html: `<p>Your verification code is <strong>${code}</strong>. It expires in 15 minutes.</p>`,
  });
}

router.post('/register', asyncHandler(async (req, res) => {
  const { username, email, password, displayName } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email, and password are required' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    return res.status(409).json({ error: 'Username or email already in use' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, email, passwordHash, displayName: displayName || username },
  });

  try {
    await sendVerificationCode(user);
  } catch (err) {
    // The account exists either way — don't fail registration over a mail
    // provider hiccup (e.g. bad SMTP credentials). The user can hit "Resend"
    // once mail is fixed, or we retry on that same click.
    console.error('[auth] failed to send verification email:', err.message);
  }

  // No token yet — the account can't log in until the code is confirmed.
  res.status(201).json({ needsVerification: true, email: user.email });
}));

router.post('/verify-email', asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'email and code are required' });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ error: 'No account found for that email' });
  if (user.emailVerified) return res.status(400).json({ error: 'Email is already verified' });

  if (
    !user.emailVerificationCode ||
    user.emailVerificationCode !== code ||
    !user.emailVerificationExpires ||
    user.emailVerificationExpires < new Date()
  ) {
    return res.status(400).json({ error: 'That code is invalid or has expired' });
  }

  const verified = await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerificationCode: null, emailVerificationExpires: null },
  });

  const token = signToken(verified);
  res.json({
    token,
    user: { id: verified.id, username: verified.username, displayName: verified.displayName, role: verified.role },
  });
}));

router.post('/resend-verification', asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const user = await prisma.user.findUnique({ where: { email } });
  // Don't reveal whether the email exists — always return ok.
  if (!user || user.emailVerified) return res.json({ ok: true });

  const justSent =
    user.emailVerificationExpires &&
    user.emailVerificationExpires.getTime() - CODE_EXPIRY_MS + RESEND_COOLDOWN_MS > Date.now();
  if (justSent) {
    return res.status(429).json({ error: 'Please wait a bit before requesting another code' });
  }

  try {
    await sendVerificationCode(user);
  } catch (err) {
    console.error('[auth] failed to resend verification email:', err.message);
    return res.status(502).json({ error: 'Could not send the email right now — try again shortly.' });
  }
  res.json({ ok: true });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  if (!user.passwordHash) {
    return res
      .status(401)
      .json({ error: 'This account uses Google sign-in. Continue with Google instead.' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  if (!user.emailVerified) {
    return res.status(403).json({ error: 'Please verify your email before logging in', needsVerification: true, email: user.email });
  }

  if (user.accountStatus === 'banned') {
    return res.status(403).json({ error: 'This account has been banned.', reason: user.statusReason || undefined });
  }
  if (user.accountStatus === 'suspended') {
    return res.status(403).json({ error: 'This account is suspended.', reason: user.statusReason || undefined });
  }

  const token = signToken(user);
  res.json({
    token,
    // JWT_EXPIRES_IN mirrors whatever signToken() actually used, so the
    // frontend can know when to expect the token to expire (e.g. to
    // proactively hit /auth/refresh) without decoding the JWT itself.
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
  });
}));

// Simple refresh: re-issues a token for a still-valid one.
// For production, swap in a real refresh-token rotation scheme.
router.post('/refresh', asyncHandler(async (req, res) => {
  const { token } = req.body;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ token: signToken(user) });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}));

router.post('/logout', (_req, res) => {
  // JWTs are stateless; logout is handled client-side by discarding the token.
  // For real invalidation, maintain a token blocklist in Redis keyed by jti.
  res.json({ ok: true });
});

// --- Google OAuth (Authorization Code flow) ---------------------------
//
// Flow: the frontend sends the browser here → we redirect to Google's
// consent screen → Google redirects back to /google/callback with a code →
// we exchange it server-side for the user's profile → find-or-create the
// user → issue our own JWT → redirect to the frontend with the token in
// the URL, where a small callback page picks it up and stores it.

router.get('/google', (_req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return res
      .status(500)
      .send('Google sign-in is not configured on this server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state: signOAuthState(),
    prompt: 'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get('/google/callback', asyncHandler(async (req, res) => {
  const { code, state, error: googleError } = req.query;

  if (googleError) {
    return res.redirect(`${FRONTEND_URL}/login?error=google_denied`);
  }
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.redirect(`${FRONTEND_URL}/login?error=google_not_configured`);
  }
  if (!code || !state || !verifyOAuthState(state)) {
    return res.redirect(`${FRONTEND_URL}/login?error=google_failed`);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[auth] Google token exchange failed:', tokenData);
      return res.redirect(`${FRONTEND_URL}/login?error=google_failed`);
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.sub || !profile.email) {
      console.error('[auth] Google profile fetch failed:', profile);
      return res.redirect(`${FRONTEND_URL}/login?error=google_failed`);
    }
    if (profile.email_verified === false) {
      return res.redirect(`${FRONTEND_URL}/login?error=google_email_unverified`);
    }

    const user = await findOrCreateGoogleUser(profile);

    const blocked = blockedReasonFor(user);
    if (blocked) {
      return res.redirect(`${FRONTEND_URL}/login?error=${blocked}`);
    }

    const jwtToken = signToken(user);
    res.redirect(`${FRONTEND_URL}/auth/callback?token=${jwtToken}`);
  } catch (err) {
    console.error('[auth] Google OAuth error:', err);
    res.redirect(`${FRONTEND_URL}/login?error=google_failed`);
  }
}));

// --- Google One-Tap / Google Identity Services (GSI) ---------------------
//
// Used when the frontend embeds Google's own sign-in button/One-Tap prompt
// directly (no page redirect) and gets back a signed `credential` (a Google
// id_token) to hand to us. We verify its signature against Google's public
// keys — this is the part that actually needs google-auth-library, since a
// self-issued check here would mean trusting an unverified JWT from the
// client, which defeats the point of using Google as an identity provider
// at all. Accepts either `credential` (GSI's field name) or `idToken` (in
// case a different Google SDK integration is used later) for the same value.
router.post('/google', asyncHandler(async (req, res) => {
  if (!googleClient || !GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'Google sign-in is not configured on this server.' });
  }

  const idToken = req.body?.credential || req.body?.idToken;
  if (!idToken) {
    return res.status(400).json({ error: 'credential (or idToken) is required' });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch (err) {
    console.error('[auth] Google id_token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired Google credential' });
  }

  if (!payload?.sub || !payload?.email) {
    return res.status(401).json({ error: 'Google credential did not include the expected profile data' });
  }
  if (payload.email_verified === false) {
    return res.status(401).json({ error: "Your Google email isn't verified — verify it with Google first." });
  }

  const user = await findOrCreateGoogleUser(payload);

  const blocked = blockedReasonFor(user);
  if (blocked) {
    const messages = {
      account_banned: 'This account has been banned.',
      account_suspended: 'This account is suspended.',
    };
    return res.status(403).json({ error: messages[blocked], reason: user.statusReason || undefined });
  }

  const token = signToken(user);
  res.json({
    token,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
  });
}));

// Used by the frontend's /auth/callback page to fetch profile details
// right after storing the token from a Google sign-in redirect.
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, username: true, displayName: true, avatarUrl: true, role: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
}));

export default router;
