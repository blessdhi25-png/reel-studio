import { Router } from 'express';
import prisma from '../config/db.js';

const router = Router();

router.get('/search', async (req, res) => {
  const q = (req.query.q || '').toString();
  if (!q.trim()) return res.json({ users: [], videos: [] });

  const [users, videos] = await Promise.all([
    prisma.user.findMany({
      where: { username: { contains: q, mode: 'insensitive' } },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
      take: 10,
    }),
    prisma.video.findMany({
      where: { status: 'published', caption: { contains: q, mode: 'insensitive' } },
      take: 10,
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    }),
  ]);

  res.json({ users, videos });
});

router.get('/trending', async (_req, res) => {
  // Simple v1: recent videos ranked by like count.
  // Swap for a Redis sorted-set-backed score once the feed_events pipeline exists.
  const videos = await prisma.video.findMany({
    where: { status: 'published' },
    orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
    take: 20,
    include: { user: { select: { id: true, username: true, avatarUrl: true } } },
  });
  res.json(videos);
});

export default router;
