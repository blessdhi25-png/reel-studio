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
      select: { id: true, role: true, accountStatus: true, statusReason: true },
    });
    if (!user) return res.status(401).json({ error: 'User not found' });

    if (user.accountStatus === 'banned') {
      return res.status(403).json({
        error: 'This account has been banned.',
        reason: user.statusReason || undefined,
      });
    }
    if (user.accountStatus === 'suspended') {
      return res.status(403).json({
        error: 'This account is suspended.',
        reason: user.statusReason || undefined,
      });
    }

    req.userId = user.id;
    req.userRole = user.role;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

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
