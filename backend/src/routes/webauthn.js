import { Router } from 'express';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import {
  STEP_UP_SCOPES,
  requireBiometric,
  requireLockedSession,
  signLockedSession,
  signStepUp,
} from '../middleware/biometric.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signToken } from './auth.js';

// Biometric lock — server-verified WebAuthn.
//
//  Active session (full token):
//    GET  /webauthn/status
//    POST /webauthn/register/options | /register/verify   (adding a 2nd device needs step-up 'register')
//    POST /webauthn/auth/options {scope} | /auth/verify    -> short-lived step-up token
//    POST /webauthn/disable                                (needs step-up 'disable')
//    POST /webauthn/session/lock                           -> restricted token for the account switcher
//  Locked session (restricted token):
//    POST /webauthn/unlock/options | /unlock/verify        -> fresh full session token
//
// Every challenge is random, server-issued, single-use and expires in 5 minutes.

const router = Router();

const RP_NAME = 'ClipPulse';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://active-reel.vercel.app';
const RP_ID = process.env.WEBAUTHN_RP_ID || new URL(FRONTEND_URL).hostname;
const ORIGINS = (process.env.WEBAUTHN_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean)) || [new URL(FRONTEND_URL).origin];
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

async function storeChallenge(userId, purpose, challenge) {
  await prisma.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.webAuthnChallenge.create({
    data: { userId, purpose, challenge, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
  });
}

// Reads the challenge the browser signed and atomically consumes the matching
// server-issued row (delete-and-count => cannot be replayed or used twice).
async function consumeChallenge(userId, purpose, response) {
  let challenge;
  try {
    challenge = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8')).challenge;
  } catch {
    return null;
  }
  if (!challenge) return null;
  const { count } = await prisma.webAuthnChallenge.deleteMany({
    where: { challenge, userId, purpose, expiresAt: { gt: new Date() } },
  });
  return count === 1 ? challenge : null;
}

async function authOptionsFor(userId, purpose) {
  const creds = await prisma.webAuthnCredential.findMany({ where: { userId } });
  if (!creds.length) return null;
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'required',
    allowCredentials: creds.map((c) => ({ id: c.id, transports: c.transports })),
  });
  await storeChallenge(userId, purpose, options.challenge);
  return options;
}

// Returns true on a verified assertion (and bumps the counter), false otherwise.
async function verifyAssertion(userId, purpose, response) {
  if (!response?.id) return false;
  const cred = await prisma.webAuthnCredential.findFirst({ where: { id: response.id, userId } });
  if (!cred) return false;
  const expectedChallenge = await consumeChallenge(userId, purpose, response);
  if (!expectedChallenge) return false;
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGINS,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: cred.id,
        publicKey: new Uint8Array(cred.publicKey),
        counter: cred.counter,
        transports: cred.transports,
      },
    });
    if (!result.verified) return false;
    await prisma.webAuthnCredential.update({
      where: { id: cred.id },
      data: { counter: result.authenticationInfo.newCounter, lastUsedAt: new Date() },
    });
    return true;
  } catch (err) {
    console.warn('[webauthn] assertion rejected:', err.message);
    return false;
  }
}

// ---------------------------------------------------------------- status
router.get('/webauthn/status', requireAuth, asyncHandler(async (req, res) => {
  const creds = await prisma.webAuthnCredential.findMany({
    where: { userId: req.userId },
    select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ enabled: creds.length > 0, credentials: creds });
}));

// ---------------------------------------------------------- registration
router.post('/webauthn/register/options', requireAuth, requireBiometric('register'), asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, username: true, displayName: true },
  });
  const existing = await prisma.webAuthnCredential.findMany({ where: { userId: user.id } });
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(user.id),
    userName: user.username,
    userDisplayName: user.displayName || user.username,
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports })),
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
  });
  await storeChallenge(user.id, 'register', options.challenge);
  res.json(options);
}));

router.post('/webauthn/register/verify', requireAuth, requireBiometric('register'), authLimiter, asyncHandler(async (req, res) => {
  const { response, deviceName } = req.body || {};
  const expectedChallenge = response ? await consumeChallenge(req.userId, 'register', response) : null;
  if (!expectedChallenge) return res.status(400).json({ error: 'Registration expired — try again.' });
  let result;
  try {
    result = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGINS,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });
  } catch (err) {
    console.warn('[webauthn] registration rejected:', err.message);
    return res.status(400).json({ error: "Couldn't verify that fingerprint — try again." });
  }
  if (!result.verified || !result.registrationInfo) return res.status(400).json({ error: "Couldn't verify that fingerprint." });
  const { credential } = result.registrationInfo;
  await prisma.webAuthnCredential.create({
    data: {
      id: credential.id,
      userId: req.userId,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: response.response?.transports || credential.transports || [],
      deviceName: typeof deviceName === 'string' ? deviceName.slice(0, 60) : null,
    },
  });
  res.json({ ok: true, enabled: true });
}));

// ------------------------------------------------------------- step-up
router.post('/webauthn/auth/options', requireAuth, asyncHandler(async (req, res) => {
  const scope = req.body?.scope;
  if (!STEP_UP_SCOPES.includes(scope)) return res.status(400).json({ error: 'Unknown scope' });
  const options = await authOptionsFor(req.userId, `stepup:${scope}`);
  if (!options) return res.json({ required: false });
  res.json({ required: true, options });
}));

router.post('/webauthn/auth/verify', requireAuth, authLimiter, asyncHandler(async (req, res) => {
  const { scope, response } = req.body || {};
  if (!STEP_UP_SCOPES.includes(scope)) return res.status(400).json({ error: 'Unknown scope' });
  if (!(await verifyAssertion(req.userId, `stepup:${scope}`, response))) {
    return res.status(403).json({ error: 'Fingerprint verification failed' });
  }
  res.json({ verified: true, stepUpToken: signStepUp(req.userId, scope), expiresInSeconds: 120 });
}));

router.post('/webauthn/disable', requireAuth, requireBiometric('disable'), asyncHandler(async (req, res) => {
  await prisma.webAuthnCredential.deleteMany({ where: { userId: req.userId } });
  res.json({ ok: true, enabled: false });
}));

// -------------------------------------------------- account-switcher lock
// Called when leaving an account. If it has the lock, the device swaps its
// stored full token for this restricted one, which is useless against every
// normal endpoint and can only be exchanged for a session via /unlock/verify.
router.post('/webauthn/session/lock', requireAuth, asyncHandler(async (req, res) => {
  if (!(await prisma.webAuthnCredential.count({ where: { userId: req.userId } }))) return res.json({ locked: false });
  res.json({ locked: true, lockedToken: signLockedSession(req.userId) });
}));

router.post('/webauthn/unlock/options', requireLockedSession, asyncHandler(async (req, res) => {
  const options = await authOptionsFor(req.userId, 'unlock');
  if (!options) return res.status(409).json({ error: 'Biometric lock is no longer enabled for this account.', code: 'LOCK_REMOVED' });
  res.json({ options });
}));

router.post('/webauthn/unlock/verify', requireLockedSession, authLimiter, asyncHandler(async (req, res) => {
  if (!(await verifyAssertion(req.userId, 'unlock', req.body?.response))) {
    return res.status(403).json({ error: 'Fingerprint verification failed' });
  }
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  res.json({ token: signToken(user) });
}));

export default router;
