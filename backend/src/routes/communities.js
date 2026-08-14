import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const USER_SELECT = { id: true, username: true, avatarUrl: true };
const ROLE_RANK = { admin: 0, moderator: 1, member: 2 };

// Reserved username for content this app creates itself (seeded
// communities today; could reasonably own other platform-generated
// content later). Deliberately not a real login-capable account —
// passwordHash is left unset, same as a Google-only user with no
// password, so there's no credential that could ever authenticate as it.
const SYSTEM_USERNAME = 'reelstudio';

const DEFAULT_COMMUNITIES = [
  {
    name: 'CodeNewbies',
    description: 'A friendly space for people just starting their coding journey — ask questions, share wins, no judgment.',
    category: 'Tech',
  },
  {
    name: 'FilmCraft',
    description: 'For creators obsessed with the craft of filmmaking — shots, edits, gear, and behind-the-scenes breakdowns.',
    category: 'Film',
  },
  {
    name: 'GamerLounge',
    description: 'Clips, highlights, and hot takes from across every platform and genre.',
    category: 'Gaming',
  },
  {
    name: 'IndieMusic',
    description: 'Independent artists and the people who discover them first.',
    category: 'Music',
  },
];

async function getOrCreateSystemUser() {
  const existing = await prisma.user.findUnique({ where: { username: SYSTEM_USERNAME } });
  if (existing) return existing;

  console.log('[communities] Reserved system user not found — creating it for seeded content.');
  try {
    return await prisma.user.create({
      data: {
        username: SYSTEM_USERNAME,
        email: 'system@reelstudio.app',
        displayName: 'Reel Studio',
        emailVerified: true,
      },
    });
  } catch (err) {
    // Two requests racing to seed an empty table at the same moment could
    // both reach here — whichever loses the unique-username race just
    // re-reads what the winner created, rather than failing outright.
    console.error('[communities] getOrCreateSystemUser create failed, re-reading (likely a concurrent seed race):', err.message);
    const user = await prisma.user.findUnique({ where: { username: SYSTEM_USERNAME } });
    if (user) return user;
    throw err;
  }
}

// Seeds the four default communities, each with the system user as its
// founding admin (mirroring the same creator-becomes-first-admin
// transaction POST /communities uses below) so every seeded community
// satisfies the same "always has at least one admin" invariant the
// join/leave logic further down relies on.
async function seedDefaultCommunities() {
  const systemUser = await getOrCreateSystemUser();

  await prisma.$transaction(
    DEFAULT_COMMUNITIES.map((c) =>
      prisma.community.create({
        data: {
          ...c,
          privacy: 'public',
          createdById: systemUser.id,
          members: { create: { userId: systemUser.id, role: 'admin' } },
        },
      })
    )
  );

  console.log(`[communities] Seeded ${DEFAULT_COMMUNITIES.length} default communities.`);
}

async function getMembership(communityId, userId) {
  if (!userId) return null;
  return prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
}

// ---------------------------------------------------------------------------
// GET /communities — discovery hub. ?category= and ?search= filter
// server-side; "My Circles" vs "Explore All" (the hub page's two tabs) is
// derived client-side from `isJoined` on each row, same reasoning as the
// Collections hub's tab filtering: the dataset is small enough that one
// request beats three, and it keeps tab-switching instant.
// ---------------------------------------------------------------------------
router.get('/communities', optionalAuth, asyncHandler(async (req, res) => {
  const { category, search } = req.query;

  // Auto-seed on a genuinely empty table — checked via an unfiltered
  // count, so a search/category query that simply has no matches never
  // triggers this; only a table with zero communities *at all* does.
  // Seeding failure is logged and swallowed rather than failing the whole
  // request: it's a nice-to-have for a fresh install, not something that
  // should turn an otherwise-fine GET into a 500.
  try {
    const totalCommunities = await prisma.community.count();
    if (totalCommunities === 0) {
      console.log('[communities] No communities exist yet — seeding defaults.');
      await seedDefaultCommunities();
    }
  } catch (err) {
    console.error('[communities] Auto-seed failed:', err.stack || err);
  }

  const communities = await prisma.community.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { members: true } },
      ...(req.userId ? { members: { where: { userId: req.userId }, select: { userId: true } } } : {}),
    },
  });

  res.json(
    communities.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      category: c.category,
      privacy: c.privacy,
      bannerUrl: c.bannerUrl,
      memberCount: c._count.members,
      isJoined: req.userId ? c.members?.length > 0 : false,
      createdAt: c.createdAt,
    }))
  );
}));

router.post('/communities', requireAuth, asyncHandler(async (req, res) => {
  const { name, description, category, privacy, bannerUrl, rules } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (privacy && !['public', 'private'].includes(privacy)) {
    return res.status(400).json({ error: 'privacy must be public or private' });
  }

  // Creator becomes the first admin in the same transaction, so a
  // community can never briefly exist with zero members/no admin.
  const community = await prisma.$transaction(async (tx) => {
    const created = await tx.community.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        category: category || null,
        privacy: privacy || 'public',
        bannerUrl: bannerUrl?.trim() || null,
        rules: rules?.trim() || null,
        createdById: req.userId,
      },
    });
    await tx.communityMember.create({
      data: { communityId: created.id, userId: req.userId, role: 'admin' },
    });
    return created;
  });

  res.status(201).json({ ...community, memberCount: 1, isJoined: true, myRole: 'admin' });
}));

router.get('/communities/:id', optionalAuth, asyncHandler(async (req, res) => {
  const community = await prisma.community.findUnique({
    where: { id: req.params.id },
    include: { createdBy: { select: USER_SELECT }, _count: { select: { members: true } } },
  });
  if (!community) return res.status(404).json({ error: 'Community not found' });

  const membership = await getMembership(community.id, req.userId);
  if (community.privacy === 'private' && !membership) {
    return res.status(404).json({ error: 'Community not found' });
  }

  // "Top members" — admins and moderators first (the people running the
  // circle), then members by tenure. Capped at 30: this powers the small
  // preview list on the detail page's header/Members tab, not a full
  // paginated roster.
  const members = await prisma.communityMember.findMany({
    where: { communityId: community.id },
    orderBy: [{ joinedAt: 'asc' }],
    take: 30,
    include: { user: { select: USER_SELECT } },
  });
  members.sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role]);

  res.json({
    id: community.id,
    name: community.name,
    description: community.description,
    category: community.category,
    privacy: community.privacy,
    bannerUrl: community.bannerUrl,
    rules: community.rules,
    pinnedAnnouncement: community.pinnedAnnouncement,
    createdBy: community.createdBy,
    memberCount: community._count.members,
    isJoined: Boolean(membership),
    myRole: membership?.role || null,
    members: members.map((m) => ({ ...m.user, role: m.role, joinedAt: m.joinedAt })),
    createdAt: community.createdAt,
    updatedAt: community.updatedAt,
  });
}));

router.patch('/communities/:id', requireAuth, asyncHandler(async (req, res) => {
  const membership = await getMembership(req.params.id, req.userId);
  if (!membership || (membership.role !== 'admin' && membership.role !== 'moderator')) {
    return res.status(403).json({ error: 'Only admins and moderators can edit this community' });
  }

  const { name, description, category, privacy, bannerUrl, rules, pinnedAnnouncement } = req.body;
  const data = {};
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
    data.name = name.trim();
  }
  if (description !== undefined) data.description = description?.trim() || null;
  if (category !== undefined) data.category = category || null;
  if (bannerUrl !== undefined) data.bannerUrl = bannerUrl?.trim() || null;
  if (rules !== undefined) data.rules = rules?.trim() || null;
  if (pinnedAnnouncement !== undefined) data.pinnedAnnouncement = pinnedAnnouncement?.trim() || null;
  if (privacy !== undefined) {
    // Only an admin (not a moderator) can flip a circle between public and
    // private — that's a bigger, membership-visibility-affecting decision
    // than editing the description or pinning an announcement.
    if (membership.role !== 'admin') {
      return res.status(403).json({ error: 'Only an admin can change privacy' });
    }
    if (!['public', 'private'].includes(privacy)) {
      return res.status(400).json({ error: 'privacy must be public or private' });
    }
    data.privacy = privacy;
  }

  const community = await prisma.community.update({ where: { id: req.params.id }, data });
  res.json(community);
}));

router.delete('/communities/:id', requireAuth, asyncHandler(async (req, res) => {
  const membership = await getMembership(req.params.id, req.userId);
  if (!membership || membership.role !== 'admin') {
    return res.status(403).json({ error: 'Only an admin can delete this community' });
  }

  // CommunityMember doesn't cascade, and Video.communityId is a real FK —
  // same reasoning as every other delete route in this app (see
  // utils/deleteVideoCascade.js): dependents have to be cleared first.
  // Videos themselves are untouched, just unlinked from the (now-gone)
  // community, the same way a deleted Collection leaves its videos intact.
  await prisma.$transaction([
    prisma.video.updateMany({ where: { communityId: req.params.id }, data: { communityId: null } }),
    prisma.communityMember.deleteMany({ where: { communityId: req.params.id } }),
    prisma.community.delete({ where: { id: req.params.id } }),
  ]);

  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Membership — POST toggles (join if not a member, leave if already one),
// exactly as specced. A sole admin can't leave out from under a
// non-empty community — they'd have to promote someone else first — but
// anyone else, including a sole admin of an otherwise-empty community, can.
// ---------------------------------------------------------------------------
router.post('/communities/:id/join', requireAuth, asyncHandler(async (req, res) => {
  const community = await prisma.community.findUnique({ where: { id: req.params.id } });
  if (!community) return res.status(404).json({ error: 'Community not found' });

  const membership = await getMembership(req.params.id, req.userId);

  if (membership) {
    if (membership.role === 'admin') {
      const [adminCount, memberCount] = await Promise.all([
        prisma.communityMember.count({ where: { communityId: req.params.id, role: 'admin' } }),
        prisma.communityMember.count({ where: { communityId: req.params.id } }),
      ]);
      if (adminCount === 1 && memberCount > 1) {
        return res.status(400).json({
          error: 'Promote another member to admin before leaving — this circle would otherwise have no admin.',
        });
      }
    }
    await prisma.communityMember.delete({
      where: { communityId_userId: { communityId: req.params.id, userId: req.userId } },
    });
    return res.json({ joined: false });
  }

  if (community.privacy === 'private') {
    return res.status(403).json({ error: 'This community is invite-only' });
  }

  await prisma.communityMember.create({
    data: { communityId: req.params.id, userId: req.userId, role: 'member' },
  });
  res.json({ joined: true });
}));

router.patch('/communities/:id/members/:userId', requireAuth, asyncHandler(async (req, res) => {
  const requester = await getMembership(req.params.id, req.userId);
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ error: 'Only an admin can change member roles' });
  }
  const { role } = req.body;
  if (!['admin', 'moderator', 'member'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin, moderator, or member' });
  }

  const target = await getMembership(req.params.id, req.params.userId);
  if (!target) return res.status(404).json({ error: 'This user is not a member of this community' });

  if (target.role === 'admin' && role !== 'admin') {
    const adminCount = await prisma.communityMember.count({
      where: { communityId: req.params.id, role: 'admin' },
    });
    if (adminCount === 1) {
      return res.status(400).json({ error: 'A community needs at least one admin' });
    }
  }

  await prisma.communityMember.update({
    where: { communityId_userId: { communityId: req.params.id, userId: req.params.userId } },
    data: { role },
  });
  res.json({ ok: true });
}));

router.delete('/communities/:id/members/:userId', requireAuth, asyncHandler(async (req, res) => {
  const requester = await getMembership(req.params.id, req.userId);
  if (!requester || (requester.role !== 'admin' && requester.role !== 'moderator')) {
    return res.status(403).json({ error: "You can't remove members from this community" });
  }
  const target = await getMembership(req.params.id, req.params.userId);
  if (!target) return res.status(404).json({ error: 'This user is not a member of this community' });
  // A moderator can remove regular members, but not another moderator or
  // the admin — that's an admin-only action, same rank-check as the role
  // change route above.
  if (requester.role === 'moderator' && target.role !== 'member') {
    return res.status(403).json({ error: 'Only an admin can remove a moderator or the admin' });
  }

  await prisma.communityMember.delete({
    where: { communityId_userId: { communityId: req.params.id, userId: req.params.userId } },
  });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// GET /communities/:id/posts — this community's own video feed. Mirrors
// GET /videos/feed's cursor pagination and isLiked/isBookmarked/track
// shaping (see routes/videos.js) so the exact same <VideoCard> component
// renders here unmodified.
// ---------------------------------------------------------------------------
router.get('/communities/:id/posts', optionalAuth, asyncHandler(async (req, res) => {
  const community = await prisma.community.findUnique({ where: { id: req.params.id } });
  if (!community) return res.status(404).json({ error: 'Community not found' });

  const membership = await getMembership(community.id, req.userId);
  if (community.privacy === 'private' && !membership) {
    return res.status(404).json({ error: 'Community not found' });
  }

  const { cursor, limit = 10 } = req.query;
  const videos = await prisma.video.findMany({
    where: { communityId: req.params.id, status: 'published' },
    orderBy: [{ createdAt: 'desc' }],
    take: Number(limit),
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: {
      user: { select: { id: true, username: true, avatarUrl: true, stripeOnboarded: true } },
      track: { include: { artist: { select: { stageName: true } } } },
    },
  });
  const nextCursor = videos.length === Number(limit) ? videos[videos.length - 1].id : null;

  let likedIds = new Set();
  let bookmarkedIds = new Set();
  let followedIds = new Set();
  if (req.userId && videos.length) {
    const authorIds = [...new Set(videos.map((v) => v.userId))];
    const videoIds = videos.map((v) => v.id);
    const [likes, bookmarks, follows] = await Promise.all([
      prisma.like.findMany({ where: { userId: req.userId, videoId: { in: videoIds } }, select: { videoId: true } }),
      prisma.bookmark.findMany({ where: { userId: req.userId, videoId: { in: videoIds } }, select: { videoId: true } }),
      prisma.follow.findMany({ where: { followerId: req.userId, followeeId: { in: authorIds } }, select: { followeeId: true } }),
    ]);
    likedIds = new Set(likes.map((l) => l.videoId));
    bookmarkedIds = new Set(bookmarks.map((b) => b.videoId));
    followedIds = new Set(follows.map((f) => f.followeeId));
  }

  res.json({
    videos: videos.map((v) => ({
      ...v,
      isLiked: likedIds.has(v.id),
      isBookmarked: bookmarkedIds.has(v.id),
      user: { ...v.user, isFollowing: followedIds.has(v.userId) },
      track: v.track
        ? {
            id: v.track.id,
            title: v.track.title,
            audioUrl: v.track.audioUrl,
            artistName: v.track.artist.stageName,
            durationSeconds: v.track.durationSeconds,
          }
        : null,
    })),
    nextCursor,
  });
}));

export default router;
