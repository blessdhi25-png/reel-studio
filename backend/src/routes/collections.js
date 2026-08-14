import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const USER_SELECT = { id: true, username: true, avatarUrl: true };
const VIDEO_CARD_SELECT = {
  id: true,
  thumbnailUrl: true,
  caption: true,
  durationSeconds: true,
  videoType: true,
  createdAt: true,
  user: { select: USER_SELECT },
};

// A collection is visible to: its owner, any of its collaborators, or
// anyone at all if it's public. Everything else 404s rather than 403s —
// same reasoning as the identical check in routes/communities.js: a 404
// doesn't confirm to a stranger that a private collection with that id
// exists at all.
async function loadVisibleCollection(id, userId) {
  const collection = await prisma.collection.findUnique({
    where: { id },
    include: {
      owner: { select: USER_SELECT },
      collaborators: { select: { userId: true } },
      _count: { select: { items: true, collaborators: true } },
    },
  });
  if (!collection) return null;

  const isOwner = userId === collection.ownerId;
  const isCollaborator = Boolean(userId) && collection.collaborators.some((c) => c.userId === userId);
  if (collection.privacy !== 'public' && !isOwner && !isCollaborator) return null;

  return { collection, isOwner, isCollaborator };
}

// Owner or collaborator can add/remove videos and manage collaborators —
// "co-curators" per the spec — but only the owner can rename, change
// privacy, or delete the collection itself (checked separately at each of
// those routes below).
async function canCurate(collection, userId) {
  if (!userId) return false;
  if (collection.ownerId === userId) return true;
  const membership = await prisma.collectionCollaborator.findUnique({
    where: { collectionId_userId: { collectionId: collection.id, userId } },
  });
  return Boolean(membership);
}

// ---------------------------------------------------------------------------
// GET /collections?tab=mine|shared|public — powers the three tab filters on
// the Collections Hub. Defaults to "mine" for a logged-in request, "public"
// for an anonymous one, since "mine"/"shared" are meaningless without a user.
//
// ?videoId= is optional and used by SaveToCollectionModal.jsx: when
// present, each collection in the response also carries `isSaved` — whether
// that specific video is already in it — so the modal's toggle switches
// open in their correct on/off state instead of always starting unchecked.
// ---------------------------------------------------------------------------
router.get('/collections', optionalAuth, asyncHandler(async (req, res) => {
  try {
    const tab = req.query.tab || (req.userId ? 'mine' : 'public');
    const { videoId } = req.query;

    let where;
    if (tab === 'mine') {
      if (!req.userId) return res.status(401).json({ error: 'Login required to view your collections' });
      where = { ownerId: req.userId };
    } else if (tab === 'shared') {
      if (!req.userId) return res.status(401).json({ error: 'Login required to view collections shared with you' });
      where = { collaborators: { some: { userId: req.userId } } };
    } else {
      where = { privacy: 'public' };
    }

    const collections = await prisma.collection.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        owner: { select: USER_SELECT },
        _count: { select: { items: true, collaborators: true } },
        // Only need 4 thumbnails for the 2x2 grid preview — most recently
        // added first, so the preview reflects what's actually new.
        items: {
          orderBy: { createdAt: 'desc' },
          take: 4,
          select: { video: { select: { id: true, thumbnailUrl: true } } },
        },
      },
    });

    let savedCollectionIds = new Set();
    if (videoId && collections.length) {
      const savedRows = await prisma.collectionItem.findMany({
        where: { videoId, collectionId: { in: collections.map((c) => c.id) } },
        select: { collectionId: true },
      });
      savedCollectionIds = new Set(savedRows.map((r) => r.collectionId));
    }

    res.json(
      collections.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        privacy: c.privacy,
        owner: c.owner,
        isOwner: req.userId === c.ownerId,
        itemCount: c._count.items,
        collaboratorCount: c._count.collaborators,
        previewThumbnails: c.items.map((i) => i.video.thumbnailUrl).filter(Boolean),
        ...(videoId ? { isSaved: savedCollectionIds.has(c.id) } : {}),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }))
    );
  } catch (err) {
    console.error('[collections] GET /collections failed', { tab: req.query.tab, videoId: req.query.videoId, userId: req.userId, error: err.message, stack: err.stack });
    throw err;
  }
}));

// ---------------------------------------------------------------------------
// POST /collections — create a new collection folder.
// ---------------------------------------------------------------------------
router.post('/collections', requireAuth, asyncHandler(async (req, res) => {
  try {
    const { name, description, privacy } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (privacy && !['public', 'private', 'collaborators'].includes(privacy)) {
      return res.status(400).json({ error: 'privacy must be public, private, or collaborators' });
    }

    const collection = await prisma.collection.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        privacy: privacy || 'private',
        ownerId: req.userId,
      },
      include: { owner: { select: USER_SELECT } },
    });

    res.status(201).json({
      ...collection,
      isOwner: true,
      itemCount: 0,
      collaboratorCount: 0,
      previewThumbnails: [],
    });
  } catch (err) {
    console.error('[collections] POST /collections failed', { userId: req.userId, body: req.body, error: err.message, stack: err.stack });
    throw err;
  }
}));

// ---------------------------------------------------------------------------
// GET /collections/:id — full detail: header stats, collaborators, and the
// saved-video grid.
// ---------------------------------------------------------------------------
router.get('/collections/:id', optionalAuth, asyncHandler(async (req, res) => {
  try {
    const result = await loadVisibleCollection(req.params.id, req.userId);
    if (!result) return res.status(404).json({ error: 'Collection not found' });
    const { collection, isOwner, isCollaborator } = result;

    const [items, collaborators] = await Promise.all([
      prisma.collectionItem.findMany({
        where: { collectionId: collection.id },
        orderBy: { createdAt: 'desc' },
        include: { video: { select: VIDEO_CARD_SELECT }, addedBy: { select: USER_SELECT } },
      }),
      prisma.collectionCollaborator.findMany({
        where: { collectionId: collection.id },
        orderBy: { addedAt: 'asc' },
        include: { user: { select: USER_SELECT } },
      }),
    ]);

    res.json({
      id: collection.id,
      name: collection.name,
      description: collection.description,
      privacy: collection.privacy,
      owner: collection.owner,
      isOwner,
      isCollaborator,
      canCurate: isOwner || isCollaborator,
      itemCount: items.length,
      collaborators: collaborators.map((c) => c.user),
      videos: items.map((i) => ({ ...i.video, addedBy: i.addedBy, savedAt: i.createdAt })),
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    });
  } catch (err) {
    console.error('[collections] GET /collections/:id failed', { collectionId: req.params.id, userId: req.userId, error: err.message, stack: err.stack });
    throw err;
  }
}));

// ---------------------------------------------------------------------------
// PATCH /collections/:id — rename, edit description, or change privacy.
// Owner-only: a collaborator can curate videos (see /save below) but
// shouldn't be able to rename or unlist someone else's collection.
// ---------------------------------------------------------------------------
router.patch('/collections/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const collection = await prisma.collection.findUnique({ where: { id: req.params.id } });
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    if (collection.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Only the owner can edit this collection' });
    }

    const { name, description, privacy } = req.body;
    const data = {};
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
      data.name = name.trim();
    }
    if (description !== undefined) data.description = description?.trim() || null;
    if (privacy !== undefined) {
      if (!['public', 'private', 'collaborators'].includes(privacy)) {
        return res.status(400).json({ error: 'privacy must be public, private, or collaborators' });
      }
      data.privacy = privacy;
    }

    const updated = await prisma.collection.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) {
    console.error('[collections] PATCH /collections/:id failed', { collectionId: req.params.id, userId: req.userId, body: req.body, error: err.message, stack: err.stack });
    throw err;
  }
}));

// ---------------------------------------------------------------------------
// DELETE /collections/:id — owner-only. CollectionItem/CollectionCollaborator
// don't cascade (see schema.prisma), so dependents are cleared first in one
// transaction — same pattern as deleteVideoCascade.js and communities.js's
// delete route. The saved videos themselves are untouched, just unlinked.
// ---------------------------------------------------------------------------
router.delete('/collections/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const collection = await prisma.collection.findUnique({ where: { id: req.params.id } });
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    if (collection.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Only the owner can delete this collection' });
    }

    await prisma.$transaction([
      prisma.collectionItem.deleteMany({ where: { collectionId: req.params.id } }),
      prisma.collectionCollaborator.deleteMany({ where: { collectionId: req.params.id } }),
      prisma.collection.delete({ where: { id: req.params.id } }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error('[collections] DELETE /collections/:id failed', { collectionId: req.params.id, userId: req.userId, error: err.message, stack: err.stack });
    throw err;
  }
}));

// ---------------------------------------------------------------------------
// POST /collections/:id/save — add or remove a video from this collection
// (toggle, matching the existing POST-toggle convention used by
// /communities/:id/join). Owner or any collaborator can curate.
// ---------------------------------------------------------------------------
router.post('/collections/:id/save', requireAuth, asyncHandler(async (req, res) => {
  try {
    const { videoId } = req.body;
    if (!videoId) return res.status(400).json({ error: 'videoId is required' });

    const collection = await prisma.collection.findUnique({ where: { id: req.params.id } });
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    if (!(await canCurate(collection, req.userId))) {
      return res.status(403).json({ error: "You don't have permission to add videos to this collection" });
    }

    const video = await prisma.video.findUnique({ where: { id: videoId }, select: { id: true } });
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const existing = await prisma.collectionItem.findUnique({
      where: { collectionId_videoId: { collectionId: req.params.id, videoId } },
    });

    if (existing) {
      await prisma.collectionItem.delete({
        where: { collectionId_videoId: { collectionId: req.params.id, videoId } },
      });
      const itemCount = await prisma.collectionItem.count({ where: { collectionId: req.params.id } });
      return res.json({ saved: false, itemCount });
    }

    await prisma.collectionItem.create({
      data: { collectionId: req.params.id, videoId, addedById: req.userId },
    });
    await prisma.collection.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } });
    const itemCount = await prisma.collectionItem.count({ where: { collectionId: req.params.id } });
    res.json({ saved: true, itemCount });
  } catch (err) {
    console.error('[collections] POST /collections/:id/save failed', { collectionId: req.params.id, userId: req.userId, body: req.body, error: err.message, stack: err.stack });
    throw err;
  }
}));

// ---------------------------------------------------------------------------
// POST /collections/:id/collaborators — invite a co-curator. Owner-only:
// a collaborator can curate videos but shouldn't be able to invite further
// collaborators on someone else's collection.
// ---------------------------------------------------------------------------
router.post('/collections/:id/collaborators', requireAuth, asyncHandler(async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const collection = await prisma.collection.findUnique({ where: { id: req.params.id } });
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    if (collection.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Only the owner can add collaborators' });
    }
    if (userId === collection.ownerId) {
      return res.status(400).json({ error: 'The owner is already a curator of this collection' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const existing = await prisma.collectionCollaborator.findUnique({
      where: { collectionId_userId: { collectionId: req.params.id, userId } },
    });
    if (existing) return res.status(200).json({ ok: true, collaborator: user });

    await prisma.collectionCollaborator.create({
      data: { collectionId: req.params.id, userId },
    });
    res.status(201).json({ ok: true, collaborator: user });
  } catch (err) {
    console.error('[collections] POST /collections/:id/collaborators failed', { collectionId: req.params.id, userId: req.userId, body: req.body, error: err.message, stack: err.stack });
    throw err;
  }
}));

// ---------------------------------------------------------------------------
// DELETE /collections/:id/collaborators/:userId — remove a co-curator.
// Owner-only, or the collaborator removing themselves ("leave").
// ---------------------------------------------------------------------------
router.delete('/collections/:id/collaborators/:userId', requireAuth, asyncHandler(async (req, res) => {
  try {
    const collection = await prisma.collection.findUnique({ where: { id: req.params.id } });
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    const isOwner = collection.ownerId === req.userId;
    const isSelf = req.params.userId === req.userId;
    if (!isOwner && !isSelf) {
      return res.status(403).json({ error: "You don't have permission to remove this collaborator" });
    }

    await prisma.collectionCollaborator.deleteMany({
      where: { collectionId: req.params.id, userId: req.params.userId },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[collections] DELETE /collections/:id/collaborators/:userId failed', { collectionId: req.params.id, targetUserId: req.params.userId, userId: req.userId, error: err.message, stack: err.stack });
    throw err;
  }
}));

export default router;
