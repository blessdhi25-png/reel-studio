import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { notify } from '../utils/notify.js';
import { uploadAvatar, uploadBanner } from '../utils/upload.js';
import { isBlocked } from './privacy.js';
import { optionalAuth } from '../middleware/auth.js';
import { getOnlineUserIds } from '../realtime/socket.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { updateProfileSchema } from '../schemas/user.js';

const router = Router();
const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

// Every handler below is wrapped in asyncHandler(...) — see
// utils/asyncHandler.js for why: on Express 4, a rejected promise inside a
// bare `async (req, res) => {...}` route never reaches the error middleware
// and never sends a response, so the request just hangs forever. That was
// the actual cause of the profile page's "infinite skeleton" — not
// anything wrong in the frontend's own fetch/loading logic.

// These must come before GET /:id — otherwise ":id" would swallow these paths.

// Real recommendation signal: people followed by people you follow (2nd-
// degree connections), ranked by how many mutuals overlap. Tops up with
// generally popular accounts if there aren't enough mutual-based candidates
// yet (e.g. a brand-new account that isn't following anyone).
router.get('/suggested', requireAuth, asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 9, 24);

  const myFollowing = await prisma.follow.findMany({
    where: { followerId: req.userId },
    select: { followeeId: true },
  });
  const followingIds = myFollowing.map((f) => f.followeeId);
  const excludeIds = [...followingIds, req.userId];

  const secondDegree = followingIds.length
    ? await prisma.follow.findMany({
        where: { followerId: { in: followingIds }, followeeId: { notIn: excludeIds } },
        select: { followeeId: true, follower: { select: { username: true } } },
      })
    : [];

  const mutuals = {};
  for (const f of secondDegree) {
    if (!mutuals[f.followeeId]) mutuals[f.followeeId] = { count: 0, sample: f.follower.username };
    mutuals[f.followeeId].count += 1;
  }

  let candidateIds = Object.keys(mutuals)
    .sort((a, b) => mutuals[b].count - mutuals[a].count)
    .slice(0, limit);

  if (candidateIds.length < limit) {
    const topUp = await prisma.user.findMany({
      where: { id: { notIn: [...excludeIds, ...candidateIds] }, accountStatus: 'active' },
      orderBy: { followers: { _count: 'desc' } },
      take: limit - candidateIds.length,
      select: { id: true },
    });
    candidateIds = [...candidateIds, ...topUp.map((u) => u.id)];
  }

  if (candidateIds.length === 0) return res.json([]);

  const users = await prisma.user.findMany({
    where: { id: { in: candidateIds } },
    select: {
      id: true, username: true, avatarUrl: true, bio: true,
      _count: { select: { followers: true } },
    },
  });

  const result = users
    .map((u) => ({
      ...u,
      mutualCount: mutuals[u.id]?.count || 0,
      mutualSample: mutuals[u.id]?.sample || null,
    }))
    .sort((a, b) => b.mutualCount - a.mutualCount || b._count.followers - a._count.followers);

  res.json(result);
}));

// Batch presence check for a set of user ids — used to show the green
// "online" dot without polling each profile individually.
router.get('/online', requireAuth, asyncHandler(async (req, res) => {
  const ids = (req.query.ids || '').split(',').filter(Boolean).slice(0, 100);
  res.json({ onlineIds: getOnlineUserIds(ids) });
}));

router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, username: true, displayName: true, avatarUrl: true, bannerUrl: true,
      bio: true, creatorStatus: true, createdAt: true, isPrivate: true,
      _count: { select: { followers: true, following: true, videos: true } },
    },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const likeSum = await prisma.video.aggregate({
    where: { userId: req.params.id, status: 'published' },
    _sum: { likeCount: true },
  });

  let blockedByMe = false;
  if (req.userId && req.userId !== req.params.id) {
    // If they've blocked me, treat the profile as gone. If I've blocked
    // them, still show it (minimally) so I can see who I blocked / unblock.
    const theyBlockedMe = await prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId: req.params.id, blockedId: req.userId } },
    });
    if (theyBlockedMe) return res.status(404).json({ error: 'User not found' });

    const iBlockedThem = await prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId: req.userId, blockedId: req.params.id } },
    });
    blockedByMe = !!iBlockedThem;
  }

  res.json({ ...user, totalLikes: likeSum._sum.likeCount || 0, blockedByMe });
}));

router.patch('/me', requireAuth, validate(updateProfileSchema), asyncHandler(async (req, res) => {
  // bannerUrl was missing here before — the frontend's edit-profile page
  // sends it (for the rare case it's set as a plain URL rather than via
  // the file-upload route below), but Prisma only writes fields explicitly
  // present in `data`, so it was silently discarded on every save.
  const { displayName, avatarUrl, bannerUrl, bio } = req.body;
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { displayName, avatarUrl, bannerUrl, bio },
  });
  res.json({ id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl, bannerUrl: user.bannerUrl, bio: user.bio });
}));

// Real photo upload for the profile picture — separate from PATCH /me so a
// large image doesn't have to round-trip as base64 inside a JSON body.
router.post('/me/avatar', requireAuth, uploadAvatar.single('avatar'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  const avatarUrl = `${BASE_URL}/uploads/avatars/${req.file.filename}`;
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { avatarUrl },
  });
  res.json({ avatarUrl: user.avatarUrl });
}));

// Mirrors POST /me/avatar above — this route never existed even though
// uploadBanner (utils/upload.js) and the frontend's api.uploadBanner() call
// already assumed it did, so every banner upload was failing outright.
router.post('/me/banner', requireAuth, uploadBanner.single('banner'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  const bannerUrl = `${BASE_URL}/uploads/banners/${req.file.filename}`;
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { bannerUrl },
  });
  res.json({ bannerUrl: user.bannerUrl });
}));

router.get('/:id/videos', optionalAuth, asyncHandler(async (req, res) => {
  if (req.userId && (await isBlocked(req.userId, req.params.id))) {
    return res.json([]);
  }

  if (req.userId !== req.params.id) {
    const owner = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { isPrivate: true },
    });
    if (owner?.isPrivate) {
      const follow = req.userId
        ? await prisma.follow.findFirst({
            where: { followerId: req.userId, followeeId: req.params.id },
          })
        : null;
      if (!follow) return res.status(403).json({ error: 'This account is private', private: true });
    }
  }

  const videos = await prisma.video.findMany({
    where: { userId: req.params.id, status: 'published' },
    orderBy: { createdAt: 'desc' },
  });
  res.json(videos);
}));

router.post('/:id/follow', requireAuth, asyncHandler(async (req, res) => {
  if (req.userId === req.params.id) {
    return res.status(400).json({ error: 'Cannot follow yourself' });
  }
  if (await isBlocked(req.userId, req.params.id)) {
    return res.status(403).json({ error: "You can't follow this account" });
  }
  await prisma.follow.upsert({
    where: { followerId_followeeId: { followerId: req.userId, followeeId: req.params.id } },
    create: { followerId: req.userId, followeeId: req.params.id },
    update: {},
  });

  const actor = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
  notify({
    userId: req.params.id,
    actorId: req.userId,
    type: 'follow',
    content: `@${actor.username} started following you`,
    targetType: 'user',
    targetId: req.userId,
  });

  res.json({ ok: true });
}));

router.delete('/:id/follow', requireAuth, asyncHandler(async (req, res) => {
  await prisma.follow.deleteMany({
    where: { followerId: req.userId, followeeId: req.params.id },
  });
  res.json({ ok: true });
}));

router.get('/:id/followers', asyncHandler(async (req, res) => {
  const followers = await prisma.follow.findMany({
    where: { followeeId: req.params.id },
    include: { follower: { select: { id: true, username: true, avatarUrl: true } } },
  });
  res.json(followers.map(f => f.follower));
}));

router.get('/:id/following', asyncHandler(async (req, res) => {
  const following = await prisma.follow.findMany({
    where: { followerId: req.params.id },
    include: { followee: { select: { id: true, username: true, avatarUrl: true } } },
  });
  res.json(following.map(f => f.followee));
}));

export default router;
