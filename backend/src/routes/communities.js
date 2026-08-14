import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const USER_SELECT = { id: true, username: true, avatarUrl: true };
const ROLE_RANK = { admin: 0, moderator: 1, member: 2 };

// Default communities seeded the first time GET /communities is called
// against an empty table (fresh install / fresh DB) — gives a brand-new
// deployment something to show instead of a blank discovery hub before any
// real user has created one.
const DEFAULT_COMMUNITIES = [
  { name: 'CodeNewbies', category: 'Tech', description: 'A friendly place to ask questions, share wins, and learn to code together — no question is too basic.' },
  { name: 'FilmCraft', category: 'Film', description: 'Cinematography, editing, and storytelling — for anyone making or studying film and video.' },
  { name: 'GamerLounge', category: 'Gaming', description: 'Clips, strategy talk, and finding people to play with — all platforms, all genres.' },
  { name: 'IndieMusic', category: 'Music', description: 'Independent artists and the people who love finding them first.' },
];

// Seeded communities need a valid createdById (Community.createdById is a
// required FK to User — see schema.prisma), so a placeholder account owns
// them rather than an arbitrary/real user being credited as the creator.
// passwordHash is left null on purpose: the same pattern this codebase
// already uses for Google-only accounts (see routes/auth.js's login
// handler) — a null hash can never satisfy bcrypt.compare, so this account
// can't be logged into through the normal password flow. It's found by a
// fixed username, not created more than once.
const SEED_ACCOUNT_USERNAME = 'reelstudio';

async function getOrCreateSeedAccount() {
  const existing = await prisma.user.findUnique({ where: { username: SEED_ACCOUNT_USERNAME } });
  if (existing) return existing;
  try {
    return await prisma.user.create({
      data: {
        username: SEED_ACCOUNT_USERNAME,
        email: 'system+reelstudio@reel-studio.internal',
        displayName: 'Reel Studio',
      },
    });
  } catch (err) {
    // Two concurrent requests can both see "no seed account" and both try
    // to create it — the loser hits the unique constraint on username.
    // That's fine: re-fetch what the winner just created instead of
    // failing the request over a benign race.
    if (err.code === 'P2002') {
      const created = await prisma.user.findUnique({ where: { username: SEED_ACCOUNT_USERNAME } });
      if (created) return created;
    }
    throw err;
  }
}

// Same race as above, one level up: two concurrent requests can both see
// an empty community table and both attempt to seed. Each default
// community is created with skipDuplicates on name+createdById... Prisma's
// createMany doesn't support a partial unique check like that directly, so
// instead this re-checks count() inside the seeding path and simply lets a
// harmless duplicate set through in the rare concurrent case — communities
// have no uniqueness constraint on name, so a duplicate is cosmetic, not a
// data-integrity issue, and won't recur past the very first cold request.
async function seedDefaultCommunitiesIfEmpty() {
  const count = await prisma.community.count();
  if (count > 0) return;

  console.log('[communities] Community table is empty — seeding default communities:', DEFAULT_COMMUNITIES.map((c) => c.name).join(', '));
  const seedAccount = await getOrCreateSeedAccount();

  await prisma.$transaction(
    DEFAULT_COMMUNITIES.map((c) =>
      prisma.community.create({
        data: {
          name: c.name,
          description: c.description,
          category: c.category,
          privacy: 'public',
          createdById: seedAccount.id,
        },
      })
    )
  );
  console.log('[communities] Seeded', DEFAULT_COMMUNITIES.length, 'default communities');
}

async function getMembership(communityId, userId) {
  if (!userId) return null;
  try {
    return await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });
  } catch (err) {
    console.error('[communities] getMembership query failed', { communityId, userId, error: err.message, stack: err.stack });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// GET /communities — discovery hub. ?category= and ?search= filter
// server-side; "My Circles" vs "Explore All" (the hub page's two tabs) is
// derived client-side from `isJoined` on each row, same reasoning as the
// Collections hub's tab filtering: the dataset is small enough that one
// request beats three, and it keeps tab-switching instant.
//
// On a completely empty table (fresh install), this seeds the four default
// communities below before running the real query, so a brand-new
// deployment's discovery hub isn't blank on day one.
// ---------------------------------------------------------------------------
router.get('/communities', optionalAuth, asyncHandler(async (req, res) => {
  const { category, search } = req.query;

  try {
    await seedDefaultCommunitiesIfEmpty();
  } catch (err) {
    // Seeding is a nice-to-have, not a hard dependency of this endpoint —
    // if it fails (e.g. a transient DB hiccup), log it with full context
    // and fall through to the real query below rather than 500ing the
    // whole discovery hub over a failed seed attempt.
    console.error('[communities] seedDefaultCommunitiesIfEmpty failed — continuing without seed data', { error: err.message, stack: err.stack });
  }

  let communities;
  try {
    communities = await prisma.community.findMany({
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
  } catch (err) {
    console.error('[communities] GET /communities query failed', { category, search, userId: req.userId, error: err.message, stack: err.stack });
    throw err;
  }

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
    console.error('[communities] POST /communities failed', { userId: req.userId, body: req.body, error: err.message, stack: err.stack });
    throw err;
  }
}));

router.get('/communities/:id', optionalAuth, asyncHandler(async (req, res) => {
  let community;
  try {
    community = await prisma.community.findUnique({
      where: { id: req.params.id },
      include: { createdBy: { select: USER_SELECT }, _count: { select: { members: true } } },
    });
  } catch (err) {
    console.error('[communities] GET /communities/:id lookup failed', { communityId: req.params.id, error: err.message, stack: err.stack });
    throw err;
  }
  if (!community) return res.status(404).json({ error: 'Community not found' });

  const membership = await getMembership(community.id, req.userId);
  if (community.privacy === 'private' && !membership) {
    return res.status(404).json({ error: 'Community not found' });
  }

  try {
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
    console.error('[communities] GET /communities/:id members query failed', { communityId: req.params.id, error: err.message, stack: err.stack });
    throw err;
  }
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

  const community = await prisma.community.update({ where: { id: req.params.id }, data }).catch((err) => {
    console.error('[communities] PATCH /communities/:id update failed', { communityId: req.params.id, userId: req.userId, data, error: err.message, stack: err.stack });
    throw err;
  });
  res.json(community);
}));

router.delete('/communities/:id', requireAuth, asyncHandler(async (req, res) => {
  const membership = await getMembership(req.params.id, req.userId);
  if (!membership || membership.role !== 'admin') {
    return res.status(403).json({ error: 'Only an admin can delete this community' });
  }

  try {
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
    console.error('[communities] DELETE /communities/:id failed', { communityId: req.params.id, userId: req.userId, error: err.message, stack: err.stack });
    throw err;
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
    console.error('[communities] POST /communities/:id/join failed', { communityId: req.params.id, userId: req.userId, error: err.message, stack: err.stack });
    throw err;
  }
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

  try {
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
    console.error('[communities] PATCH /communities/:id/members/:userId failed', { communityId: req.params.id, targetUserId: req.params.userId, requesterId: req.userId, role, error: err.message, stack: err.stack });
    throw err;
  }
}));

router.delete('/communities/:id/members/:userId', requireAuth, asyncHandler(async (req, res) => {
  const requester = await getMembership(req.params.id, req.userId);
  if (!requester || (requester.role !== 'admin' && requester.role !== 'moderator')) {
    return res.status(403).json({ error: "You can't remove members from this community" });
  }
  try {
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
    console.error('[communities] DELETE /communities/:id/members/:userId failed', { communityId: req.params.id, targetUserId: req.params.userId, requesterId: req.userId, error: err.message, stack: err.stack });
    throw err;
  }
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

  try {
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
    console.error('[communities] GET /communities/:id/posts failed', { communityId: req.params.id, userId: req.userId, query: req.query, error: err.message, stack: err.stack });
    throw err;
  }
}));


export default router;
