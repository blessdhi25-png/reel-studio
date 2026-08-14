import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const USER_SELECT = { id: true, username: true, avatarUrl: true };
const PRIVACY_VALUES = ['private', 'public', 'collaborators'];

async function getCollaboration(collectionId, userId) {
  if (!userId) return null;
  return prisma.collectionCollaborator.findUnique({
    where: { collectionId_userId: { collectionId, userId } },
  });
}

// Shared shape for a collection card (hub grid) and the owner/collaborator
// fields the detail view also needs — built once here so the hub and
// detail routes below can't quietly drift apart on what a "collection"
// looks like to the frontend.
function shapeCollectionSummary(collection, viewerId) {
  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    privacy: collection.privacy,
    owner: collection.createdBy,
    videoCount: collection._count?.items ?? 0,
    collaboratorCount: collection._count?.collaborators ?? 0,
    // Up to 4 most-recently-added thumbnails for the hub's 2x2 preview grid.
    coverThumbnails: (collection.items || [])
      .map((item) => item.video?.thumbnailUrl)
      .filter(Boolean),
    isOwner: viewerId ? collection.createdById === viewerId : false,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// GET /collections?tab=mine|shared|public — the hub's three tabs are three
// distinct queries rather than one big query filtered client-side, since
// "shared with me" and "public" can include collections that aren't mine at
// all and would otherwise require fetching far more than the hub needs.
// ---------------------------------------------------------------------------
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const tab = ['mine', 'shared', 'public'].includes(req.query.tab) ? req.query.tab : 'mine';
  const { videoId } = req.query;

  const where =
    tab === 'mine'
      ? { createdById: req.userId }
      : tab === 'shared'
        ? { collaborators: { some: { userId: req.userId } } }
        : { privacy: 'public' };

  const collections = await prisma.collection.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      createdBy: { select: USER_SELECT },
      items: { take: 4, orderBy: { addedAt: 'desc' }, include: { video: { select: { thumbnailUrl: true } } } },
      _count: { select: { items: true, collaborators: true } },
    },
  });

  const shaped = collections.map((c) => shapeCollectionSummary(c, req.userId));

  // Only done when the caller passes ?videoId= — the "save to collection"
  // modal does, so it can pre-check which of the user's collections a
  // video is already in. One extra targeted query rather than joining this
  // into every single GET /collections call that doesn't need it.
  if (videoId) {
    const savedIn = await prisma.collectionItem.findMany({
      where: { videoId, collectionId: { in: collections.map((c) => c.id) } },
      select: { collectionId: true },
    });
    const savedSet = new Set(savedIn.map((s) => s.collectionId));
    shaped.forEach((c) => {
      c.isSaved = savedSet.has(c.id);
    });
  }

  res.json(shaped);
}));

// POST /collections — create a new collection.
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { name, description, privacy } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (privacy !== undefined && !PRIVACY_VALUES.includes(privacy)) {
    return res.status(400).json({ error: `privacy must be one of: ${PRIVACY_VALUES.join(', ')}` });
  }

  const collection = await prisma.collection.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      privacy: privacy || 'private',
      createdById: req.userId,
    },
    include: {
      createdBy: { select: USER_SELECT },
      items: true,
      _count: { select: { items: true, collaborators: true } },
    },
  });

  res.status(201).json(shapeCollectionSummary(collection, req.userId));
}));

// GET /collections/:id — full detail view: videos, collaborators, and the
// viewer's own permissions on this collection.
router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const collection = await prisma.collection.findUnique({
    where: { id: req.params.id },
    include: {
      createdBy: { select: USER_SELECT },
      collaborators: { include: { user: { select: USER_SELECT } } },
      items: {
        orderBy: { addedAt: 'desc' },
        include: {
          video: {
            include: { user: { select: { id: true, username: true, avatarUrl: true, stripeOnboarded: true } } },
          },
        },
      },
    },
  });
  if (!collection) return res.status(404).json({ error: 'Collection not found' });

  const isOwner = req.userId === collection.createdById;
  const isCollaborator = collection.collaborators.some((c) => c.userId === req.userId);

  if (collection.privacy !== 'public' && !isOwner && !isCollaborator) {
    // 404, not 403 — same reasoning as communities.js's private-community
    // handling: don't confirm to a stranger that a private collection with
    // this id even exists.
    return res.status(404).json({ error: 'Collection not found' });
  }

  res.json({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    privacy: collection.privacy,
    owner: collection.createdBy,
    isOwner,
    isCollaborator,
    canEdit: isOwner || isCollaborator,
    collaborators: collection.collaborators.map((c) => ({ ...c.user, addedAt: c.addedAt })),
    videoCount: collection.items.length,
    videos: collection.items.map((item) => item.video),
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  });
}));

// PATCH /collections/:id — edit name/description/privacy. Owner-only:
// unlike adding/removing videos (open to collaborators too), renaming a
// shared collection or changing who can see it at all is kept to the
// person who created it, same rank distinction communities.js draws
// between "any moderator can edit" and "only an admin can change privacy".
router.patch('/:id', requireAuth, asyncHandler(async (req, res) => {
  const collection = await prisma.collection.findUnique({ where: { id: req.params.id } });
  if (!collection) return res.status(404).json({ error: 'Collection not found' });
  if (collection.createdById !== req.userId) {
    return res.status(403).json({ error: 'Only the owner can edit this collection' });
  }

  const { name, description, privacy } = req.body || {};
  const data = {};
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
    data.name = name.trim();
  }
  if (description !== undefined) data.description = description?.trim() || null;
  if (privacy !== undefined) {
    if (!PRIVACY_VALUES.includes(privacy)) {
      return res.status(400).json({ error: `privacy must be one of: ${PRIVACY_VALUES.join(', ')}` });
    }
    data.privacy = privacy;
  }

  const updated = await prisma.collection.update({
    where: { id: req.params.id },
    data,
    include: {
      createdBy: { select: USER_SELECT },
      items: { take: 4, orderBy: { addedAt: 'desc' }, include: { video: { select: { thumbnailUrl: true } } } },
      _count: { select: { items: true, collaborators: true } },
    },
  });

  res.json(shapeCollectionSummary(updated, req.userId));
}));

// DELETE /collections/:id — owner-only. Items/collaborators cascade via the
// schema's onDelete: Cascade; the videos themselves are untouched, only
// unlinked from this (now-gone) collection.
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const collection = await prisma.collection.findUnique({ where: { id: req.params.id } });
  if (!collection) return res.status(404).json({ error: 'Collection not found' });
  if (collection.createdById !== req.userId) {
    return res.status(403).json({ error: 'Only the owner can delete this collection' });
  }

  await prisma.collection.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// POST /collections/:id/save — toggles a video in/out of a collection.
// body: { videoId }. Open to the owner and any collaborator (that's the
// point of a collaborator — they can add/remove videos, just not rename or
// re-privacy the collection itself; see PATCH above).
router.post('/:id/save', requireAuth, asyncHandler(async (req, res) => {
  const { videoId } = req.body || {};
  if (!videoId) return res.status(400).json({ error: 'videoId is required' });

  const collection = await prisma.collection.findUnique({ where: { id: req.params.id } });
  if (!collection) return res.status(404).json({ error: 'Collection not found' });

  const isOwner = collection.createdById === req.userId;
  if (!isOwner) {
    const collaboration = await getCollaboration(collection.id, req.userId);
    if (!collaboration) {
      return res.status(403).json({ error: "You don't have permission to add to this collection" });
    }
  }

  const existing = await prisma.collectionItem.findUnique({
    where: { collectionId_videoId: { collectionId: collection.id, videoId } },
  });

  if (existing) {
    await prisma.collectionItem.delete({
      where: { collectionId_videoId: { collectionId: collection.id, videoId } },
    });
    return res.json({ saved: false });
  }

  try {
    await prisma.collectionItem.create({
      data: { collectionId: collection.id, videoId, addedById: req.userId },
    });
  } catch (err) {
    // P2002 (unique constraint) here means a concurrent request already
    // added the same video a moment ago — treat that as success rather
    // than surfacing an error for what the user experiences as "it saved".
    if (err.code !== 'P2002') {
      console.error('[collections] Failed to save video to collection:', err.stack || err);
      throw err;
    }
  }
  res.json({ saved: true });
}));

// POST /collections/:id/collaborators — owner-only. body: { userId } or
// { username }.
router.post('/:id/collaborators', requireAuth, asyncHandler(async (req, res) => {
  const collection = await prisma.collection.findUnique({ where: { id: req.params.id } });
  if (!collection) return res.status(404).json({ error: 'Collection not found' });
  if (collection.createdById !== req.userId) {
    return res.status(403).json({ error: 'Only the owner can add collaborators' });
  }

  let { userId, username } = req.body || {};
  if (!userId && username) {
    const user = await prisma.user.findUnique({ where: { username: username.trim() } });
    if (!user) return res.status(404).json({ error: 'No user found with that username' });
    userId = user.id;
  }
  if (!userId) return res.status(400).json({ error: 'userId or username is required' });
  if (userId === collection.createdById) {
    return res.status(400).json({ error: 'The owner is already on this collection' });
  }

  await prisma.collectionCollaborator.upsert({
    where: { collectionId_userId: { collectionId: collection.id, userId } },
    create: { collectionId: collection.id, userId },
    update: {},
  });

  const collaborators = await prisma.collectionCollaborator.findMany({
    where: { collectionId: collection.id },
    include: { user: { select: USER_SELECT } },
  });
  res.status(201).json(collaborators.map((c) => ({ ...c.user, addedAt: c.addedAt })));
}));

// DELETE /collections/:id/collaborators/:userId — owner-only, or a
// collaborator removing themselves (leaving a shared collection).
router.delete('/:id/collaborators/:userId', requireAuth, asyncHandler(async (req, res) => {
  const collection = await prisma.collection.findUnique({ where: { id: req.params.id } });
  if (!collection) return res.status(404).json({ error: 'Collection not found' });

  const isOwner = collection.createdById === req.userId;
  const isSelfRemoval = req.params.userId === req.userId;
  if (!isOwner && !isSelfRemoval) {
    return res.status(403).json({ error: "Only the owner can remove other collaborators" });
  }

  await prisma.collectionCollaborator.deleteMany({
    where: { collectionId: req.params.id, userId: req.params.userId },
  });
  res.json({ ok: true });
}));

export default router;
