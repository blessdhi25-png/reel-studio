import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { notify } from '../utils/notify.js';

const router = Router();

const LIVE_CATEGORIES = ['Gaming', 'Music', 'Chatting', 'Tech'];

router.get('/live', optionalAuth, async (req, res) => {
  const { category } = req.query;
  const streams = await prisma.liveStream.findMany({
    where: { status: 'live', ...(LIVE_CATEGORIES.includes(category) ? { category } : {}) },
    orderBy: { startedAt: 'desc' },
    include: { host: { select: { id: true, username: true, avatarUrl: true } } },
  });
  res.json(streams);
});

router.get('/live/:id', optionalAuth, async (req, res) => {
  const stream = await prisma.liveStream.findUnique({
    where: { id: req.params.id },
    include: { host: { select: { id: true, username: true, avatarUrl: true } } },
  });
  if (!stream) return res.status(404).json({ error: 'Stream not found' });
  res.json(stream);
});

router.post('/live/start', requireAuth, async (req, res) => {
  const { title, category, tags } = req.body;

  // Prevent a host from having two streams live at once.
  const alreadyLive = await prisma.liveStream.findFirst({
    where: { hostId: req.userId, status: 'live' },
  });
  if (alreadyLive) {
    return res.status(400).json({ error: 'You already have a live stream running', id: alreadyLive.id });
  }

  const stream = await prisma.liveStream.create({
    data: {
      hostId: req.userId,
      title: title?.trim() || 'Untitled live stream',
      category: LIVE_CATEGORIES.includes(category) ? category : null,
      tags: Array.isArray(tags) ? tags.filter(Boolean).slice(0, 10).join(',') : null,
    },
  });

  const host = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
  const followers = await prisma.follow.findMany({
    where: { followeeId: req.userId },
    select: { followerId: true },
  });
  for (const f of followers) {
    notify({
      userId: f.followerId,
      actorId: req.userId,
      type: 'live_started',
      content: `@${host.username} just went live: "${stream.title}"`,
      targetType: 'live',
      targetId: stream.id,
    });
  }

  res.status(201).json(stream);
});

router.post('/live/:id/end', requireAuth, async (req, res) => {
  const stream = await prisma.liveStream.findUnique({ where: { id: req.params.id } });
  if (!stream) return res.status(404).json({ error: 'Stream not found' });
  if (stream.hostId !== req.userId) return res.status(403).json({ error: 'Not your stream' });

  const updated = await prisma.liveStream.update({
    where: { id: req.params.id },
    data: { status: 'ended', endedAt: new Date() },
  });
  res.json(updated);
});

export default router;
