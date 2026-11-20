import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, accountStatus: true, statusReason: true, sessionsRevokedAt: true },
    });
    if (!user) return res.status(401).json({ error: 'User not found' });
    // "Sign out of other devices": tokens issued (second precision) before the cut-off are no longer valid.
    if (user.sessionsRevokedAt && payload.iat < Math.floor(user.sessionsRevokedAt.getTime() / 1000)) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    if (user.accountStatus === 'banned') {
      return res.status(403).json({
        error: 'This account has been banned.',
        code: 'ACCOUNT_BANNED',
        reason: user.statusReason || undefined,
      });
    }
    if (user.accountStatus === 'suspended') {
      return res.status(403).json({
        error: 'This account is suspended.',
        code: 'ACCOUNT_SUSPENDED',
        reason: user.statusReason || undefined,
      });
    }

    req.userId = user.id;
    req.userRole = user.role;
    // Convenience alias for code written against a req.user.role shape
    // (see authorizeRoles below) — req.userId/req.userRole above remain the
    // canonical fields every existing route in this codebase already reads.
    req.user = { id: user.id, role: user.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Alias for requireAuth — identical behavior, just named to match
// "authenticateUser" for anyone wiring routes against that convention.
export const authenticateUser = requireAuth;

// Optional auth: attaches userId if present, but doesn't block the request
export async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
      req.userId = payload.sub;
    } catch {
      // ignore invalid token, treat as anonymous
    }
  }
  next();
}

// Gate a route to specific roles. Must run after requireAuth (relies on req.userRole).
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Alias for requireRole — identical behavior, named to match
// "authorizeRoles" for anyone wiring routes against that convention.
//
// Role values are stored lowercase in the database (see the UserRole enum
// in prisma/schema.prisma: 'user' | 'moderator' | 'admin') — call this
// with those exact lowercase strings, e.g. authorizeRoles('admin',
// 'moderator'), not 'ADMIN'/'MODERATOR'. Passing uppercase strings would
// silently lock every real admin out, since req.userRole is compared
// case-sensitively against whatever's passed in here.
export const authorizeRoles = requireRole;
