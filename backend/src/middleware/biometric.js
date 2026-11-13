import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Biometric tokens are signed with keys DERIVED from JWT_SECRET, one per token
// type. A step-up or locked-session token therefore fails jwt.verify() in
// requireAuth / optionalAuth / the socket handshake (which all use JWT_SECRET
// directly) — it can never be replayed as a normal session token.
export function bioSecret(label) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(`clippulse-bio:${label}`).digest('hex');
}

export const STEP_UP_SCOPES = ['profile', 'disable', 'register'];
export const STEP_UP_TTL = '2m';

export function signStepUp(userId, scope) {
  return jwt.sign({ sub: userId, scope }, bioSecret('stepup'), { expiresIn: STEP_UP_TTL, algorithm: 'HS256' });
}

export function signLockedSession(userId) {
  return jwt.sign({ sub: userId }, bioSecret('locked'), { expiresIn: '30d', algorithm: 'HS256' });
}

export async function hasBiometricLock(userId) {
  return (await prisma.webAuthnCredential.count({ where: { userId } })) > 0;
}

// Must run after requireAuth. If the user has the lock on, the request needs a
// fresh step-up token (X-Biometric-Token) for this scope, obtained by passing a
// server-verified WebAuthn assertion at POST /webauthn/auth/verify.
export function requireBiometric(scope) {
  return asyncHandler(async (req, res, next) => {
    if (!(await hasBiometricLock(req.userId))) return next();
    const token = req.headers['x-biometric-token'];
    if (token) {
      try {
        const p = jwt.verify(token, bioSecret('stepup'), { algorithms: ['HS256'] });
        if (p.sub === req.userId && p.scope === scope) return next();
      } catch {
        /* fall through to 403 */
      }
    }
    return res.status(403).json({ error: 'Fingerprint verification required', code: 'BIOMETRIC_REQUIRED', scope });
  });
}

// For the unlock endpoints: authenticates a *locked-session* token (the
// restricted token a device keeps for an account that has the lock on).
export const requireLockedSession = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing locked session' });
  try {
    const p = jwt.verify(header.slice(7), bioSecret('locked'), { algorithms: ['HS256'] });
    const user = await prisma.user.findUnique({ where: { id: p.sub }, select: { id: true, accountStatus: true } });
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.accountStatus === 'banned' || user.accountStatus === 'suspended') {
      return res.status(403).json({ error: 'This account is not available.' });
    }
    req.userId = user.id;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired locked session' });
  }
});
