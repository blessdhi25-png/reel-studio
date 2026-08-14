import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const USER_SELECT = { id: true, username: true, avatarUrl: true };
const ROLE_RANK = { admin: 0, moderator: 1, member: 2 };

// Seeded the first time anyone hits GET /communities against an empty
// table — gives a fresh environment (a new dev's local DB, a freshly
// migrated staging env) something to actually show instead of a blank
// discovery page. Attributed to the earliest-created user rather than a
// fabricated "system" account: createdById is a required FK (see
// schema.prisma's Community model), and inventing a placeholder user just
// for this would be a bigger, riskier change than this fix asked for. If
// the database has no users at all yet, there's nothing sensible to
// attribute these to, so seeding is skipped rather than forced.
const DEFAULT_COMMUNITIES = [
  { name: 'CodeNewbies', description: 'A friendly space for people just starting to code.', category: 'tech' },
  { name: 'FilmCraft', description: 'Cinematography, editing, and the craft of filmmaking.', category: 'film' },
  { name: 'GamerLounge', description: 'Clips, strategy talk, and finding your next squad.', category: 'gaming' },
  { name: 'IndieMusic', description: 'Independent artists and the people who love finding them first.', category: 'music' },
];

async function seedDefaultCommunitiesIfEmpty() {
  const count = await prisma.community.count();
  if (count > 0) return;

  const earliestUser = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!earliestUser) {
    console.warn('[communities] Skipping default community seed — no users exist yet to own them.');
    return;
  }

  await prisma.$transaction(
    DEFAULT_COMMUNITIES.map((c) =>
      prisma.community.create({ data: { ...c, privacy: 'public', createdById: earliestUser.id } })
    )
  );
  console.log(`[communities] Seeded ${DEFAULT_COMMUNITIES.length} default communities (attributed to user ${earliestUser.id}).`);
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

  try {
    await seedDefaultCommunitiesIfEmpty();
  } catch (err) {
    // Seeding is a best-effort bootstrap, not a hard dependency of this
    // request — if it fails (e.g. a transient DB hiccup), log it and still
    // try to serve whatever's actually in the table rather than failing
    // the whole request over a convenience feature.
    console.error('[communities] Default community seed failed:', { error: err.message, stack: err.stack });
  }

  try {
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
  } catch (err) {
    console.error('[communities] GET /communities failed:', { query: req.query, userId: req.userId, error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to load communities' });
  }
}));

router.post('/communities', requireAuth, asyncHandler(async (req, res) => {
  const { name, description, category, privacy, bannerUrl, rules } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (privacy && !['public', 'private'].includes(privacy)) {
    return res.status(400).json({ error: 'privacy must be public or private' });
  }

  try {
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
  } catch (err) {
    console.error('[communities] POST /communities failed:', { userId: req.userId, body: req.body, error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to create community' });
  }
}));

router.get('/communities/:id', optionalAuth, asyncHandler(async (req, res) => {
  try {
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
  } catch (err) {
    console.error('[communities] GET /communities/:id failed:', { communityId: req.params.id, userId: req.userId, error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to load community' });
  }
}));

router.patch('/communities/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
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
  } catch (err) {
    console.error('[communities] PATCH /communities/:id failed:', { communityId: req.params.id, userId: req.userId, body: req.body, error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to update community' });
  }
}));

router.delete('/communities/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
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
  } catch (err) {
    console.error('[communities] DELETE /communities/:id failed:', { communityId: req.params.id, userId: req.userId, error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to delete community' });
  }
}));

// ---------------------------------------------------------------------------
// Membership — POST toggles (join if not a member, leave if already one),
// exactly as specced. A sole admin can't leave out from under a
// non-empty community — they'd have to promote someone else first — but
// anyone else, including a sole admin of an otherwise-empty community, can.
// ---------------------------------------------------------------------------
router.post('/communities/:id/join', requireAuth, asyncHandler(async (req, res) => {
  try {
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
  } catch (err) {
    console.error('[communities] POST /communities/:id/join failed:', { communityId: req.params.id, userId: req.userId, error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to join/leave community' });
  }
}));

router.patch('/communities/:id/members/:userId', requireAuth, asyncHandler(async (req, res) => {
  try {
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
  } catch (err) {
    console.error('[communities] PATCH /communities/:id/members/:userId failed:', { communityId: req.params.id, targetUserId: req.params.userId, userId: req.userId, error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to update member role' });
  }
}));

router.delete('/communities/:id/members/:userId', requireAuth, asyncHandler(async (req, res) => {
  try {
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
  } catch (err) {
    console.error('[communities] DELETE /communities/:id/members/:userId failed:', { communityId: req.params.id, targetUserId: req.params.userId, userId: req.userId, error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to remove member' });
  }
}));

// ---------------------------------------------------------------------------
// GET /communities/:id/posts — this community's own video feed. Mirrors
// GET /videos/feed's cursor pagination and isLiked/isBookmarked/track
// shaping (see routes/videos.js) so the exact same <VideoCard> component
// renders here unmodified.
// ---------------------------------------------------------------------------
router.get('/communities/:id/posts', optionalAuth, asyncHandler(async (req, res) => {
  try {
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
  } catch (err) {
    console.error('[communities] GET /communities/:id/posts failed:', { communityId: req.params.id, userId: req.userId, query: req.query, error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to load community posts' });
  }
}));

export default router;
