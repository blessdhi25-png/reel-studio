import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const MESSAGE_PRIVACY_VALUES = ['everyone', 'followers', 'none'];
const COMMENT_PRIVACY_VALUES = ['everyone', 'followers', 'none'];

// Whether userIdA has blocked userIdB or vice versa — used to gate
// messaging, commenting, and following.
export async function isBlocked(userIdA, userIdB) {
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userIdA, blockedId: userIdB },
        { blockerId: userIdB, blockedId: userIdA },
      ],
    },
  });
  return !!block;
}

router.get('/users/me/privacy', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { isPrivate: true, messagePrivacy: true, commentPrivacy: true },
  });
  res.json(user);
});

router.patch('/users/me/privacy', requireAuth, async (req, res) => {
  const { isPrivate, messagePrivacy, commentPrivacy } = req.body;

  const data = {};
  if (typeof isPrivate === 'boolean') data.isPrivate = isPrivate;
  if (messagePrivacy !== undefined) {
    if (!MESSAGE_PRIVACY_VALUES.includes(messagePrivacy)) {
      return res.status(400).json({ error: 'Invalid messagePrivacy value' });
    }
    data.messagePrivacy = messagePrivacy;
  }
  if (commentPrivacy !== undefined) {
    if (!COMMENT_PRIVACY_VALUES.includes(commentPrivacy)) {
      return res.status(400).json({ error: 'Invalid commentPrivacy value' });
    }
    data.commentPrivacy = commentPrivacy;
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data,
    select: { isPrivate: true, messagePrivacy: true, commentPrivacy: true },
  });
  res.json(user);
});

// Accounts the current user has blocked, most recently blocked first.
router.get('/users/me/blocked', requireAuth, async (req, res) => {
  const blocks = await prisma.block.findMany({
    where: { blockerId: req.userId },
    orderBy: { createdAt: 'desc' },
    include: { blocked: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
  });
  res.json(blocks.map((b) => b.blocked));
});

router.post('/users/:id/block', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (id === req.userId) {
    return res.status(400).json({ error: "Can't block yourself" });
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) return res.status(404).json({ error: 'User not found' });

  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: req.userId, blockedId: id } },
    create: { blockerId: req.userId, blockedId: id },
    update: {},
  });

  // Blocking severs any existing follow relationship in either direction,
  // so a blocked user immediately disappears from followers/following lists.
  await prisma.follow.deleteMany({
    where: {
      OR: [
        { followerId: req.userId, followeeId: id },
        { followerId: id, followeeId: req.userId },
      ],
    },
  });

  res.json({ ok: true });
});

router.delete('/users/:id/block', requireAuth, async (req, res) => {
  await prisma.block.deleteMany({
    where: { blockerId: req.userId, blockedId: req.params.id },
  });
  res.json({ ok: true });
});

export default router;
