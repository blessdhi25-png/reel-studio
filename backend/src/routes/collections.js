import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const USER_SELECT = { id: true, username: true, avatarUrl: true };
const VALID_PRIVACY = ['private', 'shared', 'public'];

const VIDEO_CARD_INCLUDE = {
  user: { select: { id: true, username: true, avatarUrl: true, stripeOnboarded: true } },
  // Matches the exact pattern already used in communities.js's posts
  // route — see that file's comment for why the frontend's
  // video.track.artistName/coverUrl fields stay unpopulated until a
  // separate mapping step (done in artists.js's tracks/search endpoint)
  // gets ported here too. Not something this route introduces or fixes.
  track: { include: { artist: { select: { stageName: true } } } },
};

// Shapes a Collection row (with items/_count/owner/collaborators already
// included) into the list/response format the frontend expects — shared
// by GET /collections and POST /collections so a freshly created
// collection round-trips in exactly the shape the list already uses.
function shapeCollection(c, { viewerId, role, savedHere } = {}) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    privacy: c.privacy,
    ownerId: c.ownerId,
    owner: c.owner ? { id: c.owner.id, username: c.owner.username, avatarUrl: c.owner.avatarUrl } : undefined,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    videoCount: c._count?.items ?? 0,
    previewThumbnails: (c.items || []).map((i) => i.video?.thumbnailUrl).filter(Boolean),
    role: role || (viewerId && c.ownerId === viewerId ? 'owner' : undefined),
    ...(savedHere !== undefined ? { savedHere } : {}),
  };
}

router.get('/collections', optionalAuth, asyncHandler(async (req, res) => {
  const { tab, videoId } = req.query;

  // 'mine'/'shared' (and the default, which merges both) need a signed-in
  // viewer — rather than 401 a hub page that might render before auth
  // state settles, just return an empty list. 'public' works signed out.
  if (tab !== 'public' && !req.userId) {
    return res.json({ collections: [] });
  }

  let rows = [];
  try {
    if (tab === 'public') {
      rows = await prisma.collection.findMany({
        where: { privacy: 'public', ...(req.userId ? { ownerId: { not: req.userId } } : {}) },
        orderBy: { updatedAt: 'desc' },
        take: 60,
        include: {
          owner: { select: USER_SELECT },
          _count: { select: { items: true } },
          items: { take: 4, orderBy: { addedAt: 'desc' }, include: { video: { select: { thumbnailUrl: true } } } },
        },
      });
    } else if (tab === 'mine') {
      rows = await prisma.collection.findMany({
        where: { ownerId: req.userId },
        orderBy: { updatedAt: 'desc' },
        include: {
          owner: { select: USER_SELECT },
          _count: { select: { items: true } },
          items: { take: 4, orderBy: { addedAt: 'desc' }, include: { video: { select: { thumbnailUrl: true } } } },
        },
      });
    } else if (tab === 'shared') {
      rows = await prisma.collection.findMany({
        where: { collaborators: { some: { userId: req.userId } } },
        orderBy: { updatedAt: 'desc' },
        include: {
          owner: { select: USER_SELECT },
          _count: { select: { items: true } },
          items: { take: 4, orderBy: { addedAt: 'desc' }, include: { video: { select: { thumbnailUrl: true } } } },
        },
      });
    } else {
      // Default (no tab, e.g. SaveToCollectionModal): owned + collaborator
      // collections merged — every collection the viewer can actually save
      // into.
      rows = await prisma.collection.findMany({
        where: { OR: [{ ownerId: req.userId }, { collaborators: { some: { userId: req.userId } } }] },
        orderBy: { updatedAt: 'desc' },
        include: {
          owner: { select: USER_SELECT },
          _count: { select: { items: true } },
          items: { take: 4, orderBy: { addedAt: 'desc' }, include: { video: { select: { thumbnailUrl: true } } } },
        },
      });
    }
  } catch (err) {
    console.error(`[collections] GET /collections failed (tab=${tab ?? 'default'}, userId=${req.userId ?? 'anon'}):`, err);
    throw err;
  }

  // items above only carries the 4 most recent (for thumbnail previews),
  // so whether *this specific* videoId is saved needs its own lookup —
  // the target video may not be among those 4 even when it is saved.
  let savedIds = new Set();
  if (videoId && rows.length) {
    try {
      const saved = await prisma.collectionItem.findMany({
        where: { videoId, collectionId: { in: rows.map((r) => r.id) } },
        select: { collectionId: true },
      });
      savedIds = new Set(saved.map((s) => s.collectionId));
    } catch (err) {
      console.error(`[collections] GET /collections savedHere lookup failed (videoId=${videoId}):`, err);
      throw err;
    }
  }

  const collections = rows.map((c) =>
    shapeCollection(c, {
      viewerId: req.userId,
      role: tab === 'public' ? 'public' : tab === 'shared' ? 'collaborator' : c.ownerId === req.userId ? 'owner' : 'collaborator',
      savedHere: videoId ? savedIds.has(c.id) : undefined,
    })
  );

  res.json({ collections });
}));

router.post('/collections', requireAuth, asyncHandler(async (req, res) => {
  const { name, description, privacy } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'A collection needs a name' });
  const safePrivacy = VALID_PRIVACY.includes(privacy) ? privacy : 'private';

  let collection;
  try {
    collection = await prisma.collection.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        privacy: safePrivacy,
        ownerId: req.userId,
      },
      include: { owner: { select: USER_SELECT }, _count: { select: { items: true } }, items: true },
    });
  } catch (err) {
    console.error(`[collections] POST /collections failed (userId=${req.userId}, name=${name}):`, err);
    throw err;
  }

  res.status(201).json(shapeCollection(collection, { viewerId: req.userId, role: 'owner' }));
}));

router.get('/collections/:id', optionalAuth, asyncHandler(async (req, res) => {
  let collection;
  try {
    collection = await prisma.collection.findUnique({
      where: { id: req.params.id },
      include: {
        owner: { select: USER_SELECT },
        collaborators: { include: { user: { select: USER_SELECT } } },
        _count: { select: { items: true } },
      },
    });
  } catch (err) {
    console.error(`[collections] GET /collections/:id lookup failed (id=${req.params.id}):`, err);
    throw err;
  }
  if (!collection) return res.status(404).json({ error: 'Collection not found' });

  const isOwner = req.userId && collection.ownerId === req.userId;
  const isCollaborator = req.userId && collection.collaborators.some((c) => c.userId === req.userId);

  // Privacy gates visibility only — membership (owner/collaborator) below
  // separately gates who can edit it, same split SaveToCollectionModal's
  // client-side filter already assumes.
  if (collection.privacy !== 'public' && !isOwner && !isCollaborator) {
    return res.status(404).json({ error: 'Collection not found' });
  }

  let items;
  try {
    items = await prisma.collectionItem.findMany({
      where: { collectionId: collection.id },
      orderBy: { addedAt: 'desc' },
      include: {
        video: { include: VIDEO_CARD_INCLUDE },
        addedBy: { select: USER_SELECT },
      },
    });
  } catch (err) {
    console.error(`[collections] GET /collections/:id item lookup failed (id=${collection.id}):`, err);
    throw err;
  }

  res.json({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    privacy: collection.privacy,
    owner: { id: collection.owner.id, username: collection.owner.username, avatarUrl: collection.owner.avatarUrl },
    collaborators: collection.collaborators.map((c) => c.user),
    videoCount: collection._count.items,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    myRole: isOwner ? 'owner' : isCollaborator ? 'collaborator' : collection.privacy === 'public' ? 'viewer' : null,
    videos: items.map((i) => ({ ...i.video, savedAt: i.addedAt, addedBy: i.addedBy })),
  });
}));

router.patch('/collections/:id', requireAuth, asyncHandler(async (req, res) => {
  let collection;
  try {
    collection = await prisma.collection.findUnique({ where: { id: req.params.id } });
  } catch (err) {
    console.error(`[collections] PATCH /collections/:id lookup failed (id=${req.params.id}):`, err);
    throw err;
  }
  if (!collection) return res.status(404).json({ error: 'Collection not found' });
  if (collection.ownerId !== req.userId) {
    return res.status(403).json({ error: 'Only the owner can edit this collection' });
  }

  const { name, description, privacy } = req.body;
  const data = {};
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'A collection needs a name' });
    data.name = name.trim();
  }
  if (description !== undefined) data.description = description?.trim() || null;
  if (privacy !== undefined) {
    if (!VALID_PRIVACY.includes(privacy)) return res.status(400).json({ error: 'Invalid privacy value' });
    data.privacy = privacy;
  }

  let updated;
  try {
    updated = await prisma.collection.update({
      where: { id: req.params.id },
      data,
      include: { owner: { select: USER_SELECT }, _count: { select: { items: true } }, items: true },
    });
  } catch (err) {
    console.error(`[collections] PATCH /collections/:id failed (id=${req.params.id}, fields=${Object.keys(data).join(',')}):`, err);
    throw err;
  }

  res.json(shapeCollection(updated, { viewerId: req.userId, role: 'owner' }));
}));

router.delete('/collections/:id', requireAuth, asyncHandler(async (req, res) => {
  let collection;
  try {
    collection = await prisma.collection.findUnique({ where: { id: req.params.id } });
  } catch (err) {
    console.error(`[collections] DELETE /collections/:id lookup failed (id=${req.params.id}):`, err);
    throw err;
  }
  if (!collection) return res.status(404).json({ error: 'Collection not found' });
  if (collection.ownerId !== req.userId) {
    return res.status(403).json({ error: 'Only the owner can delete this collection' });
  }

  try {
    // CollectionItem/CollectionCollaborator rows cascade-delete with the
    // collection (see prisma/schema.prisma), so this is a single delete.
    await prisma.collection.delete({ where: { id: req.params.id } });
  } catch (err) {
    console.error(`[collections] DELETE /collections/:id failed (id=${req.params.id}):`, err);
    throw err;
  }

  res.json({ ok: true });
}));

router.post('/collections/:id/save', requireAuth, asyncHandler(async (req, res) => {
  const { videoId } = req.body;
  if (!videoId) return res.status(400).json({ error: 'videoId is required' });

  let collection;
  try {
    collection = await prisma.collection.findUnique({
      where: { id: req.params.id },
      include: { collaborators: { select: { userId: true } } },
    });
  } catch (err) {
    console.error(`[collections] POST /collections/:id/save lookup failed (id=${req.params.id}):`, err);
    throw err;
  }
  if (!collection) return res.status(404).json({ error: 'Collection not found' });

  const canEdit = collection.ownerId === req.userId || collection.collaborators.some((c) => c.userId === req.userId);
  if (!canEdit) {
    return res.status(403).json({ error: "You can't save videos to this collection" });
  }

  try {
    const existing = await prisma.collectionItem.findUnique({
      where: { collectionId_videoId: { collectionId: req.params.id, videoId } },
    });

    if (existing) {
      await prisma.collectionItem.delete({
        where: { collectionId_videoId: { collectionId: req.params.id, videoId } },
      });
      res.json({ saved: false });
    } else {
      await prisma.collectionItem.create({
        data: { collectionId: req.params.id, videoId, addedById: req.userId },
      });
      res.json({ saved: true });
    }
  } catch (err) {
    console.error(`[collections] POST /collections/:id/save failed (id=${req.params.id}, videoId=${videoId}, userId=${req.userId}):`, err);
    throw err;
  }
}));

router.post('/collections/:id/collaborators', requireAuth, asyncHandler(async (req, res) => {
  const { userId, username } = req.body;
  if (!userId && !username) return res.status(400).json({ error: 'userId or username is required' });

  let collection;
  try {
    collection = await prisma.collection.findUnique({ where: { id: req.params.id } });
  } catch (err) {
    console.error(`[collections] POST /collections/:id/collaborators lookup failed (id=${req.params.id}):`, err);
    throw err;
  }
  if (!collection) return res.status(404).json({ error: 'Collection not found' });
  if (collection.ownerId !== req.userId) {
    return res.status(403).json({ error: 'Only the owner can add collaborators' });
  }

  let targetUser;
  try {
    targetUser = userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT })
      : await prisma.user.findUnique({ where: { username }, select: USER_SELECT });
  } catch (err) {
    console.error(`[collections] POST /collections/:id/collaborators user lookup failed (id=${req.params.id}):`, err);
    throw err;
  }
  if (!targetUser) return res.status(404).json({ error: 'User not found' });
  if (targetUser.id === collection.ownerId) {
    return res.status(400).json({ error: 'The owner is already part of this collection' });
  }

  try {
    await prisma.collectionCollaborator.upsert({
      where: { collectionId_userId: { collectionId: req.params.id, userId: targetUser.id } },
      update: {},
      create: { collectionId: req.params.id, userId: targetUser.id },
    });
  } catch (err) {
    console.error(`[collections] POST /collections/:id/collaborators upsert failed (id=${req.params.id}, targetUserId=${targetUser.id}):`, err);
    throw err;
  }

  res.status(201).json(targetUser);
}));

router.delete('/collections/:id/collaborators/:userId', requireAuth, asyncHandler(async (req, res) => {
  let collection;
  try {
    collection = await prisma.collection.findUnique({ where: { id: req.params.id } });
  } catch (err) {
    console.error(`[collections] DELETE /collections/:id/collaborators/:userId lookup failed (id=${req.params.id}):`, err);
    throw err;
  }
  if (!collection) return res.status(404).json({ error: 'Collection not found' });
  // The owner can remove anyone; a collaborator can only remove themself
  // (leave), matching the "co-curator, not co-owner" model — see the
  // CollectionCollaborator comment in schema.prisma.
  if (collection.ownerId !== req.userId && req.userId !== req.params.userId) {
    return res.status(403).json({ error: "You can't remove that collaborator" });
  }

  try {
    await prisma.collectionCollaborator.delete({
      where: { collectionId_userId: { collectionId: req.params.id, userId: req.params.userId } },
    });
  } catch (err) {
    console.error(`[collections] DELETE /collections/:id/collaborators/:userId failed (id=${req.params.id}, targetUserId=${req.params.userId}):`, err);
    throw err;
  }

  res.json({ ok: true });
}));

export default router;
