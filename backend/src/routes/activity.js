import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Settings → Activity centre. Everything here is the signed-in user's own history, newest first.
const router = Router();

// Account history: "the past one year" of sign-ins (see LoginEvent).
router.get('/logins', requireAuth, asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const events = await prisma.loginEvent.findMany({
    where: { userId: req.userId, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, method: true, device: true, location: true, createdAt: true },
  });
  res.json({ events });
}));

// Security alerts (Help Centre → Security alerts): recent sign-ins — flagging devices this account hasn't
// signed in from before — plus password / biometric-lock changes, newest first (last 90 days).
router.get('/security', requireAuth, asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const [logins, changes] = await Promise.all([
    prisma.loginEvent.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: { id: true, method: true, device: true, location: true, createdAt: true },
    }),
    prisma.securityEvent.findMany({
      where: { userId: req.userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, type: true, createdAt: true },
    }),
  ]);
  const seen = new Set();
  const loginAlerts = logins.map((l, i) => {
    // The first sign-in on record is the account's baseline, not a "new device" alert.
    const newDevice = i > 0 && !seen.has(l.device);
    seen.add(l.device);
    return { kind: 'login', id: l.id, method: l.method, device: l.device, location: l.location, newDevice, createdAt: l.createdAt };
  }).filter((l) => l.createdAt >= since);
  const alerts = [...loginAlerts, ...changes.map((c) => ({ kind: c.type, id: c.id, createdAt: c.createdAt }))]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 100);
  res.json({ alerts });
}));

// Comment history: comments I've written, with the video they were on.
router.get('/comments', requireAuth, asyncHandler(async (req, res) => {
  const comments = await prisma.comment.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      content: true,
      createdAt: true,
      video: { select: { id: true, caption: true, thumbnailUrl: true, user: { select: { id: true, username: true } } } },
    },
  });
  res.json({ comments });
}));

// Watch history: most recent view of each video I've watched.
router.get('/watch', requireAuth, asyncHandler(async (req, res) => {
  const logs = await prisma.watchLog.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      watchSeconds: true,
      completed: true,
      createdAt: true,
      video: { select: { id: true, caption: true, thumbnailUrl: true, user: { select: { id: true, username: true } } } },
    },
  });
  const seen = new Set();
  const items = [];
  for (const l of logs) {
    if (!l.video || seen.has(l.video.id)) continue;
    seen.add(l.video.id);
    items.push(l);
    if (items.length >= 60) break;
  }
  res.json({ items });
}));

export default router;
