import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../config/db.js';
import { sendMail, describeMailError } from '../config/mailer.js';
import { requireAuth } from '../middleware/auth.js';
import { requireBiometric } from '../middleware/biometric.js';
import { recordLogin } from '../utils/loginEvents.js';
import { recordSecurityEvent } from '../utils/securityEvents.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../schemas/auth.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between resends
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// Hosting dashboards make it easy to paste a value with a trailing newline, spaces or wrapping quotes;
// any of those turns into a Google "400 … malformed request" page, so normalise before use.
const cleanEnv = (v) => (v || '').trim().replace(/^["']|["']$/g, '').trim();
const GOOGLE_CLIENT_ID = cleanEnv(process.env.GOOGLE_CLIENT_ID);
const GOOGLE_CLIENT_SECRET = cleanEnv(process.env.GOOGLE_CLIENT_SECRET);
const GOOGLE_REDIRECT_URI =
  cleanEnv(process.env.GOOGLE_REDIRECT_URI) ||
  `${cleanEnv(process.env.BASE_URL).replace(/\/+$/, '') || 'http://localhost:4000'}/api/v1/auth/google/callback`;
// No trailing slash (a "https://site/" value would produce "//login" redirects).
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
if (process.env.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/.test(FRONTEND_URL)) {
  console.warn('[auth] FRONTEND_URL points at localhost in production — Google sign-in will redirect people to the wrong site.');
}

// Used to verify One-Tap/GSI id_tokens (POST /google below). The redirect
// flow (GET /google/callback) doesn't need this client — it exchanges the
// code for tokens via plain REST calls instead — but id_token verification
// specifically needs a signature check against Google's rotating public
// keys, which this library handles correctly instead of us reimplementing
// JWKS verification by hand.
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

export function signToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

// Short-lived, self-verifying OAuth state — avoids needing server-side
// session storage just to guard against CSRF on the Google redirect.
// Same-site return path carried through the signed state (so it can't be tampered with). Anything that
// isn't a plain "/path" — or that points at an auth screen — is dropped.
function safeFrom(from) {
  if (typeof from !== 'string' || from.length > 300 || !/^\/(?!\/|\\)/.test(from)) return null;
  return /^\/(login|signup|register|auth)(\/|\?|#|$)/.test(from) ? null : from;
}

function signOAuthState(from) {
  const safe = safeFrom(from);
  return jwt.sign({ purpose: 'google_oauth_state', ...(safe ? { from: safe } : {}) }, process.env.JWT_SECRET, { expiresIn: '10m' });
}

// Returns the verified payload, or null.
function verifyOAuthState(state) {
  try {
    const payload = jwt.verify(state, process.env.JWT_SECRET);
    return payload.purpose === 'google_oauth_state' ? payload : null;
  } catch {
    return null;
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
      // Google sign-in arrives pre-verified and never passes through
      // POST /verify-email (see the welcome-email call there) — this is
      // the only "just signed up" moment a brand-new Google-authenticated
      // user gets, so it has to fire here specifically, and only in this
      // branch (a genuinely new account), not the existingByEmail link
      // case above, which is an existing user, not a new signup.
      sendWelcomeEmail(user).catch((err) =>
        console.error('[auth] failed to send welcome email:', err.message)
      );
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

// Fresh OTP + expiry, in the shape Prisma wants for the user row.
function newVerificationFields() {
  return {
    emailVerificationCode: generateCode(),
    emailVerificationExpires: new Date(Date.now() + CODE_EXPIRY_MS),
  };
}

async function sendVerificationEmail(email, code) {
  await sendMail({
    to: email,
    subject: 'Verify your Bledhi account',
    text: `Your verification code is ${code}. It expires in 15 minutes.`,
    html: `<p>Your verification code is <strong>${code}</strong>. It expires in 15 minutes.</p>`,
  });
}

async function sendVerificationCode(user) {
  const fields = newVerificationFields();
  await prisma.user.update({ where: { id: user.id }, data: fields });
  await sendVerificationEmail(user.email, fields.emailVerificationCode);
}

// JSON body for a failed verification email: a user-safe message plus a
// stable `reason` code ("smtp_auth_failed", "smtp_connection_failed", ...)
// so the frontend/you can tell an API-key problem from a network problem
// without opening the server logs.
function mailFailureBody(err) {
  const { reason, message } = describeMailError(err);
  return {
    error: `We couldn't send the verification email. ${message}`,
    code: 'email_send_failed',
    reason,
  };
}

// Sent once someone can actually use the account — after email
// verification for a normal signup, or immediately on account creation for
// Google sign-in (which arrives pre-verified and never passes through
// verify-email at all). Best-effort: a failure here shouldn't block
// verify-email/login, so callers fire-and-catch this rather than await it
// inline in the response path — see both call sites below.
async function sendWelcomeEmail(user) {
  const name = user.displayName || user.username;
  await sendMail({
    to: user.email,
    subject: 'Welcome to ClipPulse! \ud83d\ude80',
    text: `Hey ${name}, welcome to ClipPulse! Set up your profile and post your first short video to get started.`,
    html: `
      <div style="background:#0a0a0f;padding:40px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <div style="max-width:480px;margin:0 auto;background:#16151d;border:1px solid #2a2836;border-radius:16px;padding:36px 32px;">
          <p style="color:#e8a33d;font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;margin:0 0 20px;">
            ClipPulse
          </p>
          <h1 style="color:#f2ebe2;font-size:24px;line-height:1.3;margin:0 0 16px;">
            Welcome, ${name}! \ud83d\ude80
          </h1>
          <p style="color:#9a8fa8;font-size:15px;line-height:1.6;margin:0 0 28px;">
            Your account is ready. Here's how to get started:
          </p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
            <tr>
              <td style="padding:12px 0;border-top:1px solid #2a2836;color:#f2ebe2;font-size:14px;">
                \ud83d\udcf7 &nbsp;Set up your profile — add a photo and bio
              </td>
            </tr>
            <tr>
              <td style="padding:12px 0;border-top:1px solid #2a2836;color:#f2ebe2;font-size:14px;">
                \ud83c\udfac &nbsp;Post your first short video
              </td>
            </tr>
            <tr>
              <td style="padding:12px 0;border-top:1px solid #2a2836;border-bottom:1px solid #2a2836;color:#f2ebe2;font-size:14px;">
                \ud83d\udc65 &nbsp;Follow a few creators to build your feed
              </td>
            </tr>
          </table>
          <a href="${FRONTEND_URL}/upload"
             style="display:inline-block;background:#e8a33d;color:#0a0a0f;font-size:14px;font-weight:700;
                    text-decoration:none;padding:12px 24px;border-radius:999px;">
            Post your first video
          </a>
          <p style="color:#5c5468;font-size:12px;margin:32px 0 0;">
            You're receiving this because you created a ClipPulse account.
          </p>
        </div>
      </div>
    `,
  });
}

router.post('/register', authLimiter, validate(registerSchema), asyncHandler(async (req, res) => {
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

  const normalizedEmail = email;
  const matches = await prisma.user.findMany({
    where: { OR: [{ email: normalizedEmail }, { username }] },
  });
  const byEmail = matches.find((u) => u.email === normalizedEmail) || null;
  const byUsername = matches.find((u) => u.username === username) || null;

  // Any VERIFIED account holding the email or username is a real conflict.
  if (matches.some((u) => u.emailVerified)) {
    return res.status(409).json({ error: 'Username or email already in use' });
  }

  // A different, unverified row squatting on the username (someone who
  // never finished signing up, e.g. mistyped their email) only blocks it
  // while its code is still live; after that it's abandoned and reclaimed.
  if (byUsername && byUsername.id !== byEmail?.id) {
    const stillPending =
      byUsername.emailVerificationExpires && byUsername.emailVerificationExpires > new Date();
    if (stillPending) {
      return res.status(409).json({ error: 'Username or email already in use' });
    }
    try {
      await prisma.user.delete({ where: { id: byUsername.id } });
    } catch (err) {
      console.error('[auth/register] could not reclaim abandoned username:', err);
      return res.status(409).json({ error: 'Username or email already in use' });
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const verification = newVerificationFields();
  let user;
  let createdNow = false;

  if (byEmail) {
    // Unverified account for this email already exists — typically a retry
    // after the first verification email failed or got lost. Instead of a
    // dead-end "already in use", refresh its details and send a new code.
    // Respect the resend cooldown so this can't be used to spam an inbox.
    const justSent =
      byEmail.emailVerificationExpires &&
      byEmail.emailVerificationExpires.getTime() - CODE_EXPIRY_MS + RESEND_COOLDOWN_MS > Date.now();
    if (justSent) {
      return res.status(429).json({ error: 'A code was just sent — please wait a minute before trying again' });
    }
    user = await prisma.user.update({
      where: { id: byEmail.id },
      data: { username, passwordHash, displayName: displayName || username, ...verification },
    });
  } else {
    try {
      user = await prisma.user.create({
        data: { username, email: normalizedEmail, passwordHash, displayName: displayName || username, ...verification },
      });
      createdNow = true;
    } catch (err) {
      // Two simultaneous signups can both pass the lookup above; the unique
      // index decides the winner.
      if (err?.code === 'P2002') {
        return res.status(409).json({ error: 'Username or email already in use' });
      }
      throw err;
    }
  }

  try {
    await sendVerificationEmail(user.email, verification.emailVerificationCode);
  } catch (err) {
    // sendMail already logged the full error ("Email send error: ...").
    console.error(`[auth/register] verification email failed for user ${user.id}:`, err.message);
    if (createdNow) {
      // Roll back the row this request created so a retry isn't met with
      // "username/email already in use". (Pre-existing unverified rows are
      // kept — the user can simply try again and get a fresh code.)
      try {
        await prisma.user.delete({ where: { id: user.id } });
      } catch (delErr) {
        console.error(`[auth/register] rollback failed for user ${user.id}:`, delErr);
      }
    }
    return res.status(502).json(mailFailureBody(err));
  }

  // No token yet — the account can't log in until the code is confirmed.
  res.status(201).json({ needsVerification: true, email: user.email, emailSendFailed: false });
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

  // Fire-and-forget — a failed welcome email is a nice-to-have miss, not
  // something that should block someone from actually getting into their
  // new account.
  sendWelcomeEmail(verified).catch((err) =>
    console.error('[auth] failed to send welcome email:', err.message)
  );

  const token = signToken(verified);
  res.json({
    token,
    user: { id: verified.id, username: verified.username, displayName: verified.displayName, role: verified.role },
  });
}));

router.post('/resend-verification', authLimiter, asyncHandler(async (req, res) => {
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
    return res.status(502).json(mailFailureBody(err));
  }
  res.json({ ok: true });
}));

router.post('/login', authLimiter, validate(loginSchema), asyncHandler(async (req, res) => {
  try {
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
    recordLogin(req, user.id, 'password');
    res.json({
      token,
      // JWT_EXPIRES_IN mirrors whatever signToken() actually used, so the
      // frontend can know when to expect the token to expire (e.g. to
      // proactively hit /auth/refresh) without decoding the JWT itself.
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    });
  } catch (err) {
    // asyncHandler already forwards this to the global handler either way
    // (see utils/asyncHandler.js) — this catch exists purely so the log
    // line is tagged with exactly which route failed and includes the full
    // stack, since the global handler alone can't tell a Prisma "unknown
    // field" schema-mismatch error apart from any other 500 without it.
    console.error('[auth/login error]:', err.stack || err);
    throw err;
  }
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

router.get('/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return loginRedirect(res, 'google_not_configured');

  // Don't send people to a Google page we already know will fail. A client ID is always
  // "<digits>-<hash>.apps.googleusercontent.com", and the redirect URI must be an absolute http(s) URL.
  let redirectOk = false;
  try { redirectOk = /^https?:$/.test(new URL(GOOGLE_REDIRECT_URI).protocol); } catch {}
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(GOOGLE_CLIENT_ID) || !redirectOk) {
    console.error('[auth/google] GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI is malformed (check for stray spaces, quotes or a missing https://).');
    return loginRedirect(res, 'google_misconfigured');
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state: signOAuthState(req.query.from),
    prompt: 'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// Every failure in the callback lands on /login?authError=<code> so the sign-in screen can say what
// happened instead of silently bouncing. Codes are fixed strings — never raw error text or secrets.
function loginRedirect(res, code) {
  return res.redirect(`${FRONTEND_URL}/login?authError=${encodeURIComponent(code)}`);
}

// Maps a thrown error to a safe, coarse code (details stay in the server log).
function classifyGoogleError(err) {
  const c = err?.code;
  if (c === 'P2021' || c === 'P2022') return 'server_schema_outdated'; // migrations not applied
  if (c === 'P1001' || c === 'P1002' || c === 'P1008' || c === 'P1017') return 'server_db_unreachable';
  if (c === 'P2002') return 'account_conflict'; // unique constraint (username/email/googleId)
  if (c && String(c).startsWith('P')) return 'server_db_error';
  return 'google_failed';
}

router.get('/google/callback', asyncHandler(async (req, res) => {
  const { code, state, error: googleError } = req.query;

  if (googleError) return loginRedirect(res, googleError === 'access_denied' ? 'google_denied' : 'google_failed');
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return loginRedirect(res, 'google_not_configured');
  if (!process.env.JWT_SECRET) {
    console.error('[auth/google-callback] JWT_SECRET is not set');
    return loginRedirect(res, 'server_misconfigured');
  }
  if (!code) return loginRedirect(res, 'google_failed');
  const statePayload = state ? verifyOAuthState(state) : null;
  if (!statePayload) return loginRedirect(res, 'google_state_invalid'); // expired (>10 min) or tampered

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
      // invalid_grant / redirect_uri_mismatch / invalid_client — the Google error name is safe to log.
      console.error('[auth] Google token exchange failed:', tokenData.error, tokenData.error_description);
      return loginRedirect(res, 'google_token_exchange_failed');
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.sub || !profile.email) {
      console.error('[auth] Google profile fetch failed:', profile.error || profileRes.status);
      return loginRedirect(res, 'google_profile_failed');
    }
    if (profile.email_verified === false) return loginRedirect(res, 'google_email_unverified');

    const user = await findOrCreateGoogleUser(profile);

    const blocked = blockedReasonFor(user);
    if (blocked) return loginRedirect(res, blocked);

    const jwtToken = signToken(user);
    const fromQs = statePayload.from ? `&from=${encodeURIComponent(statePayload.from)}` : '';
    res.redirect(`${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(jwtToken)}${fromQs}`);
  } catch (err) {
    console.error('[auth/google-callback error]:', err.code || '', err.stack || err);
    loginRedirect(res, classifyGoogleError(err));
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
  try {
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
      console.error('[auth/google error] id_token verification failed:', err.message);
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
    recordLogin(req, user.id, 'google');
    res.json({
      token,
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    });
  } catch (err) {
    console.error('[auth/google error]:', err.stack || err);
    throw err;
  }
}));

// Used by the frontend's /auth/callback page to fetch profile details
// right after storing the token from a Google sign-in redirect.
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, username: true, displayName: true, avatarUrl: true, role: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  // requireAuth already 403s (code ACCOUNT_SUSPENDED / ACCOUNT_BANNED) for locked accounts, so a
  // 200 here means the account is active — the frontend's suspension guard relies on that.
  res.json(user);
}));

// Creates a reset token and emails the link. Shared by forgot-password and account lookup.
async function issueResetEmail(user) {
  // The raw token goes out in the email and is never stored anywhere —
  // only its SHA-256 hash is saved to the DB (see the schema comment on
  // User.resetPasswordToken). 256 bits of entropy from randomBytes(32)
  // is well beyond brute-forceable within the 1-hour window even if the
  // stored hash somehow leaked.
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetPasswordToken: hashedToken,
      resetPasswordExpires: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
    },
  });

  const resetUrl = `${FRONTEND_URL}/reset-password?token=${rawToken}`;
  try {
    await sendMail({
      to: user.email,
      subject: 'Reset your Bledhi password',
      text: `We got a request to reset your password. This link expires in 1 hour:\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email — your password won't change.`,
      html: `<p>We got a request to reset your password. This link expires in 1 hour:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email — your password won't change.</p>`,
    });
  } catch (err) {
    // Same reasoning as sendVerificationCode above — a mail-provider
    // hiccup shouldn't turn into a 500 that also (via a non-generic
    // error) reveals that the email did in fact match an account.
    console.error('[auth/forgot-password] failed to send reset email:', err.message);
  }

}

// Always returns the same generic success message whether or not the email
// exists — a distinguishable response here (e.g. 404 for unknown emails)
// would let an attacker enumerate which addresses have accounts on this
// app, which is exactly what password-reset flows are commonly abused for.
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), asyncHandler(async (req, res) => {
  try {
    const { email } = req.body;
    const GENERIC_MESSAGE = {
      message: 'If an account with that email exists, a password reset link has been sent.',
    };

    if (!email) return res.status(400).json({ error: 'email is required' });

    const user = await prisma.user.findUnique({ where: { email } });
    // Google-only accounts have no passwordHash to reset — silently no-op
    // rather than emailing a reset link that would just confuse someone
    // who has never set a password on this account.
    if (!user || !user.passwordHash) {
      return res.json(GENERIC_MESSAGE);
    }

    await issueResetEmail(user);

    res.json(GENERIC_MESSAGE);
  } catch (err) {
    console.error('[auth/forgot-password error]:', err.stack || err);
    throw err;
  }
}));

router.post('/reset-password', authLimiter, validate(resetPasswordSchema), asyncHandler(async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'token and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await prisma.user.findFirst({
      where: { resetPasswordToken: hashedToken, resetPasswordExpires: { gt: new Date() } },
    });
    if (!user) {
      return res.status(400).json({ error: 'That reset link is invalid or has expired. Request a new one.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        // Clearing both fields invalidates the token immediately — a used
        // (or abandoned) reset link can never be replayed.
        resetPasswordToken: null,
        sessionsRevokedAt: new Date(), // a reset signs out every device that was using the old password
        resetPasswordExpires: null,
      },
    });

    res.json({ message: 'Your password has been reset. You can now log in with your new password.' });
  } catch (err) {
    console.error('[auth/reset-password error]:', err.stack || err);
    throw err;
  }
}));

// "Look up your account": find an account by username, email or phone number and start recovery.
// Whatever the input matches (or doesn't), the response is identical, so this can't be used to find out who
// has an account; the recovery link is only ever sent to the email address already on file.
const LOOKUP_MESSAGE = { message: "If we find a matching account, we've emailed recovery instructions to the address on file. Check your inbox and spam folder." };
router.post('/account-lookup', authLimiter, asyncHandler(async (req, res) => {
  const raw = typeof req.body?.identifier === 'string' ? req.body.identifier.trim().slice(0, 120) : '';
  if (raw.length < 3) return res.status(400).json({ error: 'Enter your username, email or phone number.' });

  try {
    let user = null;
    if (raw.includes('@') && !raw.startsWith('@')) {
      user = await prisma.user.findFirst({ where: { email: { equals: raw, mode: 'insensitive' } } });
    } else if (/^\+?[\d\s().-]{7,20}$/.test(raw)) {
      // Phone numbers are stored in whatever format people typed, so match on the last 9 digits and confirm.
      const digits = raw.replace(/\D/g, '');
      const tail = digits.slice(-9);
      const candidates = await prisma.user.findMany({ where: { phone: { contains: tail } }, take: 5 });
      const exact = candidates.filter((u) => (u.phone || '').replace(/\D/g, '').endsWith(tail));
      user = exact.length === 1 ? exact[0] : null; // ambiguous matches are ignored rather than guessed
    } else {
      user = await prisma.user.findFirst({ where: { username: { equals: raw.replace(/^@/, ''), mode: 'insensitive' } } });
    }
    if (user && user.passwordHash) await issueResetEmail(user);
  } catch (err) {
    console.error('[auth/account-lookup]', err.message); // same response either way
  }
  res.json(LOOKUP_MESSAGE);
}));

// Sign out of every other device: tokens issued before now stop working; this device gets a fresh token.
router.post('/sessions/revoke-others', requireAuth, authLimiter, asyncHandler(async (req, res) => {
  await prisma.user.update({ where: { id: req.userId }, data: { sessionsRevokedAt: new Date() } });
  recordSecurityEvent(req.userId, 'sessions_revoked');
  res.json({ token: signToken({ id: req.userId }) });
}));

// Authenticated password change from within the app (Settings), as
// distinct from the logged-out forgot/reset pair above. Requires the
// current password rather than just a valid session, so a hijacked/
// left-open session alone isn't enough to lock the real owner out.
router.post('/change-password', requireAuth, requireBiometric('password'), authLimiter, validate(changePasswordSchema), asyncHandler(async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    // confirmPassword is optional here — the frontend should already be
    // checking newPassword === confirmPassword client-side before this
    // request is even sent, but this is a cheap extra guard against a
    // client bug slipping a mismatched pair through.
    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New passwords do not match' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    // req.userId (not req.user.id — requireAuth in middleware/auth.js only
    // sets req.userId/req.userRole, it never attaches a req.user object).
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // The schema field is passwordHash, not password.
    if (!user.passwordHash) {
      return res.status(400).json({ error: 'This account signs in with Google and has no password to change.' });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      // Also clear any pending reset token — if one existed from an
      // abandoned forgot-password flow, it's invalidated the moment the
      // password actually changes through this path instead.
      data: { passwordHash, resetPasswordToken: null, resetPasswordExpires: null },
    });

    recordSecurityEvent(user.id, 'password_changed');
    res.json({ message: 'Password updated.' });
  } catch (err) {
    console.error('[auth/change-password error]:', err.stack || err);
    throw err;
  }
}));

export { sendVerificationCode };
export default router;
