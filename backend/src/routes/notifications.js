import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/notifications', requireAuth, async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const actorIds = [...new Set(notifications.map((n) => n.actorId).filter(Boolean))];
  const [actors, myFollows] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, username: true, avatarUrl: true },
    }),
    prisma.follow.findMany({
      where: { followerId: req.userId, followeeId: { in: actorIds } },
      select: { followeeId: true },
    }),
  ]);
  const actorMap = Object.fromEntries(actors.map((a) => [a.id, a]));
  const followedIds = new Set(myFollows.map((f) => f.followeeId));

  // For like/comment/tip notifications pointing at a video, grab a thumbnail
  // so the row can show a preview image on the right.
  const videoIds = [
    ...new Set(
      notifications
        .filter((n) => n.targetType === 'video' && n.targetId)
        .map((n) => n.targetId)
    ),
  ];
  const videos = videoIds.length
    ? await prisma.video.findMany({
        where: { id: { in: videoIds } },
        select: { id: true, thumbnailUrl: true },
      })
    : [];
  const videoMap = Object.fromEntries(videos.map((v) => [v.id, v]));

  res.json(
    notifications.map((n) => ({
      ...n,
      actor: n.actorId
        ? { ...actorMap[n.actorId], isFollowing: followedIds.has(n.actorId) }
        : null,
      videoThumbnailUrl:
        n.targetType === 'video' && n.targetId ? videoMap[n.targetId]?.thumbnailUrl || null : null,
    }))
  );
});

router.get('/notifications/unread-count', requireAuth, async (req, res) => {
  const count = await prisma.notification.count({ where: { userId: req.userId, read: false } });
  res.json({ count });
});

router.post('/notifications/:id/read', requireAuth, async (req, res) => {
  await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.userId },
    data: { read: true },
  });
  res.json({ ok: true });
});

router.post('/notifications/read-all', requireAuth, async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.userId, read: false },
    data: { read: true },
  });
  res.json({ ok: true });
});

export default router;
