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
