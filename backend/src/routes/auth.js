import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../config/db.js';
import { sendMail } from '../config/mailer.js';
import { requireAuth } from '../middleware/auth.js';
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
      // Google accounts skip the emailed-code verification flow entirely
      // (Google already verified the address), so this is the one place a
      // Google-created account needs its own welcome-email trigger — the
      // /verify-email route's trigger never runs for these users.
      try {
        await sendWelcomeEmail(user);
      } catch (err) {
        console.error('[auth] failed to send welcome email:', err.message);
      }
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
    subject: 'Verify your ClipPulse account',
    text: `Your verification code is ${code}. It expires in 15 minutes.`,
    html: `<p>Your verification code is <strong>${code}</strong>. It expires in 15 minutes.</p>`,
  });
}

// Sent once, right after email verification succeeds — that's when the
// account is actually real/usable, rather than at raw registration when
// it's still an unverified, unusable row.
async function sendWelcomeEmail(user) {
  const name = user.displayName || user.username;
  await sendMail({
    to: user.email,
    subject: 'Welcome to ClipPulse! 🚀',
    text: `Hey ${name}, welcome to ClipPulse! Set up your profile and post your first short video to get started.`,
    html: `
      <div style="background:#0a090e;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <div style="max-width:480px;margin:0 auto;background:#151319;border:1px solid #2a2730;border-radius:16px;overflow:hidden;">
          <div style="padding:32px 28px 8px;">
            <p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#f5a623;font-weight:600;">
              ClipPulse
            </p>
            <h1 style="margin:0 0 16px;font-size:22px;color:#ffffff;">Welcome, ${name} 🚀</h1>
            <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#b8b3c2;">
              Your account is verified and ready to go. Two quick things to get the most out of ClipPulse:
            </p>
            <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:24px;">
              <tr>
                <td style="padding:12px 0;border-top:1px solid #2a2730;font-size:14px;color:#e8e4ee;">
                  🧑‍🎨&nbsp;&nbsp;Set up your profile — add a photo and bio so people know it's you
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-top:1px solid #2a2730;font-size:14px;color:#e8e4ee;">
                  🎬&nbsp;&nbsp;Post your first short video — it's the fastest way to start getting seen
                </td>
              </tr>
            </table>
            <a href="${FRONTEND_URL}"
               style="display:inline-block;background:#f5a623;color:#0a090e;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px;text-decoration:none;">
              Open ClipPulse
            </a>
          </div>
          <div style="padding:16px 28px;background:#0d0c11;border-top:1px solid #2a2730;">
            <p style="margin:0;font-size:11px;color:#6b6673;">
              You're getting this because you just verified a ClipPulse account.
            </p>
          </div>
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

  let emailSendFailed = false;
  try {
    await sendVerificationCode(user);
  } catch (err) {
    // The account still gets created — a mail-provider hiccup shouldn't
    // undo a successful signup — but the response now says so honestly
    // instead of implying the email went out when it didn't. The frontend
    // can show "we couldn't send it, tap Resend" instead of a generic
    // "check your email" that's actively misleading if nothing arrives.
    console.error('[auth] failed to send verification email:', err.message);
    emailSendFailed = true;
  }

  // No token yet — the account can't log in until the code is confirmed.
  res.status(201).json({ needsVerification: true, email: user.email, emailSendFailed });
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

  try {
    await sendWelcomeEmail(verified);
  } catch (err) {
    // A failed welcome email is a nice-to-have miss, not a reason to fail
    // an otherwise-successful verification — same non-blocking reasoning
    // as the verification code send above.
    console.error('[auth] failed to send welcome email:', err.message);
  }

  const token = signToken(verified);
  res.json({
    token,
    user: { id: verified.id, username: verified.username, displayName: verified.displayName, role: verified.role },
  });
}));

// authLimiter (IP-based) sits alongside the per-email cooldown below —
// the cooldown alone doesn't stop someone hammering many different email
// addresses from the same IP to spam OTP emails; the limiter catches that,
// the cooldown catches repeated hits on the same address.
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
    return res.status(502).json({ error: 'Could not send the email right now — try again shortly.' });
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
    console.error('[auth/google-callback error]:', err.stack || err);
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
  res.json(user);
}));

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
        subject: 'Reset your ClipPulse password',
        text: `We got a request to reset your password. This link expires in 1 hour:\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email — your password won't change.`,
        html: `<p>We got a request to reset your password. This link expires in 1 hour:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email — your password won't change.</p>`,
      });
    } catch (err) {
      // Same reasoning as sendVerificationCode above — a mail-provider
      // hiccup shouldn't turn into a 500 that also (via a non-generic
      // error) reveals that the email did in fact match an account.
      console.error('[auth/forgot-password] failed to send reset email:', err.message);
    }

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
        resetPasswordExpires: null,
      },
    });

    res.json({ message: 'Your password has been reset. You can now log in with your new password.' });
  } catch (err) {
    console.error('[auth/reset-password error]:', err.stack || err);
    throw err;
  }
}));

// Authenticated password change from within the app (Settings), as
// distinct from the logged-out forgot/reset pair above. Requires the
// current password rather than just a valid session, so a hijacked/
// left-open session alone isn't enough to lock the real owner out.
router.post('/change-password', requireAuth, authLimiter, validate(changePasswordSchema), asyncHandler(async (req, res) => {
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

    res.json({ message: 'Password updated.' });
  } catch (err) {
    console.error('[auth/change-password error]:', err.stack || err);
    throw err;
  }
}));

export default router;
