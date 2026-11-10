import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { notify } from '../utils/notify.js';
import { isBlocked } from './privacy.js';

const router = Router();

// POST /posts/repost { videoId } — idempotent: reposting something you've
// already reposted returns 200 with alreadyReposted instead of an error, so a
// double-tap never shows a failure.
router.post('/repost', requireAuth, asyncHandler(async (req, res) => {
  const videoId = typeof req.body?.videoId === 'string' ? req.body.videoId : '';
  if (!videoId) return res.status(400).json({ error: 'videoId is required' });

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, userId: true, status: true, user: { select: { isPrivate: true } } },
  });
  if (!video || video.status !== 'published') return res.status(404).json({ error: 'Post not found' });
  if (video.userId === req.userId) return res.status(400).json({ error: "You can't repost your own post" });
  if (await isBlocked(req.userId, video.userId)) return res.status(404).json({ error: 'Post not found' });
  if (video.user?.isPrivate) {
    const follows = await prisma.follow.findFirst({ where: { followerId: req.userId, followeeId: video.userId }, select: { followerId: true } });
    if (!follows) return res.status(403).json({ error: "This account is private — you can't repost its posts" });
  }

  const existing = await prisma.repost.findUnique({ where: { userId_videoId: { userId: req.userId, videoId } } });
  if (existing) return res.json({ reposted: true, alreadyReposted: true, id: existing.id });

  const repost = await prisma.repost.create({ data: { userId: req.userId, videoId } });
  const actor = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
  notify({
    userId: video.userId, actorId: req.userId, type: 'repost',
    content: `@${actor?.username || 'someone'} reposted your post`, targetType: 'video', targetId: videoId,
  });
  res.status(201).json({ reposted: true, alreadyReposted: false, id: repost.id });
}));

// DELETE /posts/repost/:videoId — undo.
router.delete('/repost/:videoId', requireAuth, asyncHandler(async (req, res) => {
  await prisma.repost.deleteMany({ where: { userId: req.userId, videoId: req.params.videoId } });
  res.json({ reposted: false });
}));

export default router;
