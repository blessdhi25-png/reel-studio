import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { notify } from '../utils/notify.js';
import { isBlocked } from './privacy.js';

const router = Router();

router.post('/videos/:id/like', requireAuth, async (req, res) => {
  const existing = await prisma.like.findUnique({
    where: { userId_videoId: { userId: req.userId, videoId: req.params.id } },
  });
  if (existing) return res.json({ ok: true });

  await prisma.like.create({
    data: { userId: req.userId, videoId: req.params.id },
  });
  const video = await prisma.video.update({
    where: { id: req.params.id },
    data: { likeCount: { increment: 1 } },
  });

  const actor = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
  notify({
    userId: video.userId,
    actorId: req.userId,
    type: 'like',
    content: `@${actor.username} liked your video`,
    targetType: 'video',
    targetId: video.id,
  });

  res.json({ ok: true });
});

router.delete('/videos/:id/like', requireAuth, async (req, res) => {
  const deleted = await prisma.like.deleteMany({
    where: { userId: req.userId, videoId: req.params.id },
  });
  if (deleted.count > 0) {
    await prisma.video.update({
      where: { id: req.params.id },
      data: { likeCount: { decrement: 1 } },
    });
  }
  res.json({ ok: true });
});

router.post('/videos/:id/bookmark', requireAuth, async (req, res) => {
  const existing = await prisma.bookmark.findUnique({
    where: { userId_videoId: { userId: req.userId, videoId: req.params.id } },
  });
  if (existing) return res.json({ ok: true });

  await prisma.bookmark.create({
    data: { userId: req.userId, videoId: req.params.id },
  });
  await prisma.video.update({
    where: { id: req.params.id },
    data: { bookmarkCount: { increment: 1 } },
  });
  res.json({ ok: true });
});

router.delete('/videos/:id/bookmark', requireAuth, async (req, res) => {
  const deleted = await prisma.bookmark.deleteMany({
    where: { userId: req.userId, videoId: req.params.id },
  });
  if (deleted.count > 0) {
    await prisma.video.update({
      where: { id: req.params.id },
      data: { bookmarkCount: { decrement: 1 } },
    });
  }
  res.json({ ok: true });
});

// Saved videos for the current user, most recently bookmarked first — powers
// a "Saved" tab on the profile page.
router.get('/users/me/bookmarks', requireAuth, async (req, res) => {
  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    include: {
      video: {
        include: { user: { select: { id: true, username: true, avatarUrl: true, stripeOnboarded: true } } },
      },
    },
  });
  res.json(bookmarks.map((b) => b.video));
});

// Liked videos for the current user, most recently liked first — powers a
// "Liked" tab on the profile page.
router.get('/users/me/likes', requireAuth, async (req, res) => {
  const likes = await prisma.like.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    include: {
      video: {
        include: { user: { select: { id: true, username: true, avatarUrl: true, stripeOnboarded: true } } },
      },
    },
  });
  res.json(likes.map((l) => l.video));
});

router.get('/videos/:id/comments', async (req, res) => {
  const comments = await prisma.comment.findMany({
    where: { videoId: req.params.id },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { id: true, username: true, avatarUrl: true } } },
  });
  res.json(comments);
});

router.post('/videos/:id/comments', requireAuth, async (req, res) => {
  const { content, parentCommentId } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'content is required' });
  }

  const video = await prisma.video.findUnique({
    where: { id: req.params.id },
    select: { userId: true },
  });
  if (!video) return res.status(404).json({ error: 'Video not found' });

  if (await isBlocked(req.userId, video.userId)) {
    return res.status(403).json({ error: "You can't comment on this video" });
  }

  const owner = await prisma.user.findUnique({
    where: { id: video.userId },
    select: { commentPrivacy: true },
  });
  if (owner.commentPrivacy === 'none' && video.userId !== req.userId) {
    return res.status(403).json({ error: 'Comments are turned off for this account' });
  }
  if (owner.commentPrivacy === 'followers' && video.userId !== req.userId) {
    const follow = await prisma.follow.findFirst({
      where: { followerId: req.userId, followeeId: video.userId },
    });
    if (!follow) {
      return res.status(403).json({ error: 'Only followers can comment on this account' });
    }
  }

  const comment = await prisma.comment.create({
    data: { videoId: req.params.id, userId: req.userId, content, parentCommentId },
  });
  await prisma.video.update({
    where: { id: req.params.id },
    data: { commentCount: { increment: 1 } },
  });

  const actor = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
  notify({
    userId: video.userId,
    actorId: req.userId,
    type: 'comment',
    content: `@${actor.username} commented on your video`,
    targetType: 'video',
    targetId: req.params.id,
  });

  res.status(201).json(comment);
});

router.delete('/comments/:id', requireAuth, async (req, res) => {
  const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.userId !== req.userId) return res.status(403).json({ error: 'Not your comment' });

  await prisma.comment.delete({ where: { id: req.params.id } });
  await prisma.video.update({
    where: { id: comment.videoId },
    data: { commentCount: { decrement: 1 } },
  });
  res.json({ ok: true });
});

export default router;
