import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const USER_SELECT = { id: true, username: true, avatarUrl: true };
const ROLE_RANK = { admin: 0, moderator: 1, member: 2 };

// Shown to every fresh install so the discovery hub is never empty on
// first load — these are ordinary public communities, not special-cased
// afterward, so they can be edited/joined/deleted like anything else.
const DEFAULT_COMMUNITIES = [
  { name: 'CodeNewbies', category: 'coding', description: 'A friendly space for people just starting out with code to share progress, ask questions, and post what they built.' },
  { name: 'FilmCraft', category: 'film', description: 'For filmmakers and editors to swap techniques, get feedback on cuts, and talk gear and workflow.' },
  { name: 'GamerLounge', category: 'gaming', description: 'Clips, streams, and hot takes — a hangout for gamers of every platform and genre.' },
  { name: 'IndieMusic', category: 'music', description: 'Independent musicians sharing tracks, production tips, and collabs outside the label system.' },
];

async function getMembership(communityId, userId) {
  if (!userId) return null;
  try {
    return await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });
  } catch (err) {
    console.error(`[communities] getMembership failed (communityId=${communityId}, userId=${userId}):`, err);
    throw err;
  }
}

// Community.createdById is a required FK to User, so the seeded rows need
// a real owner — we don't invent a placeholder user row for it. We prefer
// an existing admin (so the seeded communities are moderated by someone
// with the authority to edit/delete them), falling back to whichever user
// registered first. If the users table is empty too, there's nothing valid
// to set createdById to, so we skip seeding rather than violate the FK.
async function seedDefaultCommunitiesIfEmpty() {
  let existingCount;
  try {
    existingCount = await prisma.community.count();
  } catch (err) {
    console.error('[communities] seed: failed to count existing communities:', err);
    throw err;
  }

  if (existingCount > 0) return;

  let seedOwner;
  try {
    seedOwner =
      (await prisma.user.findFirst({ where: { role: 'admin' }, orderBy: { createdAt: 'asc' } })) ||
      (await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }));
  } catch (err) {
    console.error('[communities] seed: failed to look up a user to own the default communities:', err);
    throw err;
  }

  if (!seedOwner) {
    console.warn('[communities] seed: no users exist yet, skipping default community seed (createdById has no valid FK target).');
    return;
  }

  try {
    const { count } = await prisma.community.createMany({
      data: DEFAULT_COMMUNITIES.map((c) => ({
        name: c.name,
        description: c.description,
        category: c.category,
        privacy: 'public',
        createdById: seedOwner.id,
      })),
    });
    console.log(`[communities] seed: created ${count} default communities (owner: ${seedOwner.username}, id: ${seedOwner.id}).`);
  } catch (err) {
    console.error('[communities] seed: failed to create default communities:', err);
    throw err;
  }
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

  await seedDefaultCommunitiesIfEmpty();

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
    console.error(`[communities] GET /communities failed (category=${category ?? 'none'}, search=${search ?? 'none'}):`, err);
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

  // Creator becomes the first admin in the same transaction, so a
  // community can never briefly exist with zero members/no admin.
  let community;
  try {
    community = await prisma.$transaction(async (tx) => {
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
  } catch (err) {
    console.error(`[communities] POST /communities failed (userId=${req.userId}, name=${name}):`, err);
    throw err;
  }

  res.status(201).json({ ...community, memberCount: 1, isJoined: true, myRole: 'admin' });
}));

router.get('/communities/:id', optionalAuth, asyncHandler(async (req, res) => {
  let community;
  try {
    community = await prisma.community.findUnique({
      where: { id: req.params.id },
      include: { createdBy: { select: USER_SELECT }, _count: { select: { members: true } } },
    });
  } catch (err) {
    console.error(`[communities] GET /communities/:id failed (id=${req.params.id}):`, err);
    throw err;
  }
  if (!community) return res.status(404).json({ error: 'Community not found' });

  const membership = await getMembership(community.id, req.userId);
  if (community.privacy === 'private' && !membership) {
    return res.status(404).json({ error: 'Community not found' });
  }

  // "Top members" — admins and moderators first (the people running the
  // circle), then members by tenure. Capped at 30: this powers the small
  // preview list on the detail page's header/Members tab, not a full
  // paginated roster.
  let members;
  try {
    members = await prisma.communityMember.findMany({
      where: { communityId: community.id },
      orderBy: [{ joinedAt: 'asc' }],
      take: 30,
      include: { user: { select: USER_SELECT } },
    });
  } catch (err) {
    console.error(`[communities] GET /communities/:id member lookup failed (communityId=${community.id}):`, err);
    throw err;
  }
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

  let community;
  try {
    community = await prisma.community.update({ where: { id: req.params.id }, data });
  } catch (err) {
    console.error(`[communities] PATCH /communities/:id failed (id=${req.params.id}, fields=${Object.keys(data).join(',')}):`, err);
    throw err;
  }
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
  try {
    await prisma.$transaction([
      prisma.video.updateMany({ where: { communityId: req.params.id }, data: { communityId: null } }),
      prisma.communityMember.deleteMany({ where: { communityId: req.params.id } }),
      prisma.community.delete({ where: { id: req.params.id } }),
    ]);
  } catch (err) {
    console.error(`[communities] DELETE /communities/:id failed (id=${req.params.id}):`, err);
    throw err;
  }

  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Membership — POST toggles (join if not a member, leave if already one),
// exactly as specced. A sole admin can't leave out from under a
// non-empty community — they'd have to promote someone else first — but
// anyone else, including a sole admin of an otherwise-empty community, can.
// ---------------------------------------------------------------------------
router.post('/communities/:id/join', requireAuth, asyncHandler(async (req, res) => {
  let community;
  try {
    community = await prisma.community.findUnique({ where: { id: req.params.id } });
  } catch (err) {
    console.error(`[communities] POST /communities/:id/join lookup failed (id=${req.params.id}):`, err);
    throw err;
  }
  if (!community) return res.status(404).json({ error: 'Community not found' });

  const membership = await getMembership(req.params.id, req.userId);

  if (membership) {
    try {
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
    } catch (err) {
      console.error(`[communities] POST /communities/:id/join (leave) failed (id=${req.params.id}, userId=${req.userId}):`, err);
      throw err;
    }
    return res.json({ joined: false });
  }

  if (community.privacy === 'private') {
    return res.status(403).json({ error: 'This community is invite-only' });
  }

  try {
    await prisma.communityMember.create({
      data: { communityId: req.params.id, userId: req.userId, role: 'member' },
    });
  } catch (err) {
    console.error(`[communities] POST /communities/:id/join (join) failed (id=${req.params.id}, userId=${req.userId}):`, err);
    throw err;
  }
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

  try {
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
  } catch (err) {
    console.error(`[communities] PATCH /communities/:id/members/:userId failed (id=${req.params.id}, targetUserId=${req.params.userId}, role=${role}):`, err);
    throw err;
  }
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

  try {
    await prisma.communityMember.delete({
      where: { communityId_userId: { communityId: req.params.id, userId: req.params.userId } },
    });
  } catch (err) {
    console.error(`[communities] DELETE /communities/:id/members/:userId failed (id=${req.params.id}, targetUserId=${req.params.userId}):`, err);
    throw err;
  }
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// GET /communities/:id/posts — this community's own video feed. Mirrors
// GET /videos/feed's cursor pagination and isLiked/isBookmarked/track
// shaping (see routes/videos.js) so the exact same <VideoCard> component
// renders here unmodified.
// ---------------------------------------------------------------------------
router.get('/communities/:id/posts', optionalAuth, asyncHandler(async (req, res) => {
  let community;
  try {
    community = await prisma.community.findUnique({ where: { id: req.params.id } });
  } catch (err) {
    console.error(`[communities] GET /communities/:id/posts lookup failed (id=${req.params.id}):`, err);
    throw err;
  }
  if (!community) return res.status(404).json({ error: 'Community not found' });

  const membership = await getMembership(community.id, req.userId);
  if (community.privacy === 'private' && !membership) {
    return res.status(404).json({ error: 'Community not found' });
  }

  const { cursor, limit = 10 } = req.query;
  let videos;
  try {
    videos = await prisma.video.findMany({
      where: { communityId: req.params.id, status: 'published' },
      orderBy: [{ createdAt: 'desc' }],
      take: Number(limit),
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        user: { select: { id: true, username: true, avatarUrl: true, stripeOnboarded: true } },
        track: { include: { artist: { select: { stageName: true } } } },
      },
    });
  } catch (err) {
    console.error(`[communities] GET /communities/:id/posts video query failed (id=${req.params.id}, cursor=${cursor ?? 'none'}, limit=${limit}):`, err);
    throw err;
  }
  const nextCursor = videos.length === Number(limit) ? videos[videos.length - 1].id : null;

  let likedIds = new Set();
  let bookmarkedIds = new Set();
  let followedIds = new Set();
  if (req.userId && videos.length) {
    const authorIds = [...new Set(videos.map((v) => v.userId))];
    const videoIds = videos.map((v) => v.id);
    try {
      const [likes, bookmarks, follows] = await Promise.all([
        prisma.like.findMany({ where: { userId: req.userId, videoId: { in: videoIds } }, select: { videoId: true } }),
        prisma.bookmark.findMany({ where: { userId: req.userId, videoId: { in: videoIds } }, select: { videoId: true } }),
        prisma.follow.findMany({ where: { followerId: req.userId, followeeId: { in: authorIds } }, select: { followeeId: true } }),
      ]);
      likedIds = new Set(likes.map((l) => l.videoId));
      bookmarkedIds = new Set(bookmarks.map((b) => b.videoId));
      followedIds = new Set(follows.map((f) => f.followeeId));
    } catch (err) {
      console.error(`[communities] GET /communities/:id/posts like/bookmark/follow lookup failed (id=${req.params.id}, userId=${req.userId}):`, err);
      throw err;
    }
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
