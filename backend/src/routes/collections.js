// Collections.js

import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const USER_SELECT = { id: true, username: true, avatarUrl: true };
const PRIVACY_VALUES = ['private', 'public', 'shared'];

async function getRole(collectionId, userId) {
  if (!userId) return null;
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: { ownerId: true },
  });
  if (!collection) return null;
  if (collection.ownerId === userId) return 'owner';
  const collab = await prisma.collectionCollaborator.findUnique({
    where: { collectionId_userId: { collectionId, userId } },
  });
  return collab ? 'collaborator' : null;
}

// Shapes a Video row into the same object <VideoCard> already knows how to
// render (isLiked/isBookmarked/flattened track/user.isFollowing) — copied
// from GET /communities/:id/posts' shaping in routes/communities.js, so the
// collection detail page's "Play All" reel can mount <VideoCard> directly
// against these results with zero translation layer.
async function shapeVideosForViewer(videos, viewerId) {
  let likedIds = new Set();
  let bookmarkedIds = new Set();
  let followedIds = new Set();
  if (viewerId && videos.length) {
    const authorIds = [...new Set(videos.map((v) => v.userId))];
    const videoIds = videos.map((v) => v.id);
    const [likes, bookmarks, follows] = await Promise.all([
      prisma.like.findMany({ where: { userId: viewerId, videoId: { in: videoIds } }, select: { videoId: true } }),
      prisma.bookmark.findMany({ where: { userId: viewerId, videoId: { in: videoIds } }, select: { videoId: true } }),
      prisma.follow.findMany({ where: { followerId: viewerId, followeeId: { in: authorIds } }, select: { followeeId: true } }),
    ]);
    likedIds = new Set(likes.map((l) => l.videoId));
    bookmarkedIds = new Set(bookmarks.map((b) => b.videoId));
    followedIds = new Set(follows.map((f) => f.followeeId));
  }

  return videos.map((v) => ({
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
  }));
}

// ---------------------------------------------------------------------------
// GET /collections — one request covers all three hub tabs (My Collections,
// Shared with Me, Public Collections); the frontend buckets by the `role`
// this returns per row. Same reasoning as GET /communities' "My Circles" vs
// "Explore All" split (see routes/communities.js): the dataset per user is
// small enough that one request beats three separate round-trips, and
// switching tabs client-side is instant instead of re-fetching.
// ---------------------------------------------------------------------------
router.get(
  '/collections',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { videoId } = req.query;
    try {
      const collections = await prisma.collection.findMany({
        where: {
          OR: [
            { ownerId: req.userId },
            { collaborators: { some: { userId: req.userId } } },
            { privacy: 'public' },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          owner: { select: USER_SELECT },
          collaborators: { select: { userId: true, user: { select: USER_SELECT } } },
          _count: { select: { videos: true } },
          videos: {
            orderBy: { addedAt: 'desc' },
            take: 4,
            include: { video: { select: { id: true, thumbnailUrl: true } } },
          },
        },
      });

      // Only computed when SaveToCollectionModal passes ?videoId= — tells
      // it which of the user's collections already contain this exact
      // video, so it can render pre-checked toggles instead of opening
      // with everything blank every time.
      let savedInSet = new Set();
      if (videoId) {
        const saved = await prisma.collectionVideo.findMany({
          where: { videoId, collectionId: { in: collections.map((c) => c.id) } },
          select: { collectionId: true },
        });
        savedInSet = new Set(saved.map((s) => s.collectionId));
      }

      res.json(
        collections.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          privacy: c.privacy,
          owner: c.owner,
          role: c.ownerId === req.userId ? 'owner' : c.collaborators.some((cl) => cl.userId === req.userId) ? 'collaborator' : 'viewer',
          videoCount: c._count.videos,
          collaboratorCount: c.collaborators.length,
          previewThumbnails: c.videos.map((v) => v.video.thumbnailUrl).filter(Boolean),
          ...(videoId ? { savedHere: savedInSet.has(c.id) } : {}),
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }))
      );
    } catch (err) {
      console.error('[collections] GET /collections failed:', { userId: req.userId, videoId, error: err.message, stack: err.stack });
      res.status(500).json({ error: 'Failed to load collections' });
    }
  })
);

router.post(
  '/collections',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name, description, privacy } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (privacy && !PRIVACY_VALUES.includes(privacy)) {
      return res.status(400).json({ error: `privacy must be one of: ${PRIVACY_VALUES.join(', ')}` });
    }

    try {
      const collection = await prisma.collection.create({
        data: {
          name: name.trim().slice(0, 80),
          description: description?.trim().slice(0, 300) || null,
          privacy: privacy || 'private',
          ownerId: req.userId,
        },
        include: { owner: { select: USER_SELECT } },
      });

      res.status(201).json({
        ...collection,
        role: 'owner',
        videoCount: 0,
        collaboratorCount: 0,
        previewThumbnails: [],
      });
    } catch (err) {
      console.error('[collections] POST /collections failed:', { userId: req.userId, body: req.body, error: err.message, stack: err.stack });
      res.status(500).json({ error: 'Failed to create collection' });
    }
  })
);

router.get(
  '/collections/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    try {
      const collection = await prisma.collection.findUnique({
        where: { id: req.params.id },
        include: {
          owner: { select: USER_SELECT },
          collaborators: { include: { user: { select: USER_SELECT } } },
        },
      });
      if (!collection) return res.status(404).json({ error: 'Collection not found' });

      const isCollaborator = req.userId ? collection.collaborators.some((c) => c.userId === req.userId) : false;
      const isOwner = collection.ownerId === req.userId;
      const canView =
        collection.privacy === 'public' || isOwner || (collection.privacy === 'shared' && isCollaborator);
      if (!canView) return res.status(404).json({ error: 'Collection not found' });

      const entries = await prisma.collectionVideo.findMany({
        where: { collectionId: collection.id },
        orderBy: { addedAt: 'desc' },
        include: {
          addedBy: { select: USER_SELECT },
          video: {
            include: {
              user: { select: { id: true, username: true, avatarUrl: true, stripeOnboarded: true } },
              track: { include: { artist: { select: { stageName: true } } } },
            },
          },
        },
      });

      const shapedVideos = await shapeVideosForViewer(entries.map((e) => e.video), req.userId);
      const videos = entries.map((e, i) => ({
        ...shapedVideos[i],
        addedBy: e.addedBy,
        addedAt: e.addedAt,
      }));

      res.json({
        id: collection.id,
        name: collection.name,
        description: collection.description,
        privacy: collection.privacy,
        owner: collection.owner,
        collaborators: collection.collaborators.map((c) => ({ ...c.user, addedAt: c.addedAt })),
        myRole: isOwner ? 'owner' : isCollaborator ? 'collaborator' : null,
        videoCount: videos.length,
        videos,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
      });
    } catch (err) {
      console.error('[collections] GET /collections/:id failed:', { collectionId: req.params.id, userId: req.userId, error: err.message, stack: err.stack });
      res.status(500).json({ error: 'Failed to load collection' });
    }
  })
);

router.patch(
  '/collections/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const collection = await prisma.collection.findUnique({ where: { id: req.params.id }, select: { ownerId: true } });
      if (!collection) return res.status(404).json({ error: 'Collection not found' });
      if (collection.ownerId !== req.userId) return res.status(403).json({ error: 'Only the owner can edit this collection' });

      const { name, description, privacy } = req.body;
      const data = {};
      if (name !== undefined) {
        if (!name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
        data.name = name.trim().slice(0, 80);
      }
      if (description !== undefined) data.description = description?.trim().slice(0, 300) || null;
      if (privacy !== undefined) {
        if (!PRIVACY_VALUES.includes(privacy)) {
          return res.status(400).json({ error: `privacy must be one of: ${PRIVACY_VALUES.join(', ')}` });
        }
        data.privacy = privacy;
      }

      const updated = await prisma.collection.update({ where: { id: req.params.id }, data });
      res.json(updated);
    } catch (err) {
      console.error('[collections] PATCH /collections/:id failed:', { collectionId: req.params.id, userId: req.userId, error: err.message, stack: err.stack });
      res.status(500).json({ error: 'Failed to update collection' });
    }
  })
);

router.delete(
  '/collections/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const collection = await prisma.collection.findUnique({ where: { id: req.params.id }, select: { ownerId: true } });
      if (!collection) return res.status(404).json({ error: 'Collection not found' });
      if (collection.ownerId !== req.userId) return res.status(403).json({ error: 'Only the owner can delete this collection' });

      // CollectionVideo/CollectionCollaborator cascade on Collection delete
      // (see schema.prisma) — the underlying videos themselves are
      // untouched, only unlinked from this (now-gone) collection.
      await prisma.collection.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (err) {
      console.error('[collections] DELETE /collections/:id failed:', { collectionId: req.params.id, userId: req.userId, error: err.message, stack: err.stack });
      res.status(500).json({ error: 'Failed to delete collection' });
    }
  })
);

// POST /collections/:id/save — toggle a video's membership in this
// collection. Owner or collaborator only; a collection's own privacy
// setting governs who can *see* it, not who can edit its contents.
router.post(
  '/collections/:id/save',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { videoId } = req.body;
    if (!videoId) return res.status(400).json({ error: 'videoId is required' });

    try {
      const role = await getRole(req.params.id, req.userId);
      if (!role) return res.status(403).json({ error: "You don't have permission to edit this collection" });

      const video = await prisma.video.findUnique({ where: { id: videoId }, select: { id: true } });
      if (!video) return res.status(404).json({ error: 'Video not found' });

      const existing = await prisma.collectionVideo.findUnique({
        where: { collectionId_videoId: { collectionId: req.params.id, videoId } },
      });

      if (existing) {
        await prisma.collectionVideo.delete({
          where: { collectionId_videoId: { collectionId: req.params.id, videoId } },
        });
      } else {
        await prisma.collectionVideo.create({
          data: { collectionId: req.params.id, videoId, addedById: req.userId },
        });
      }
      await prisma.collection.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } });

      const videoCount = await prisma.collectionVideo.count({ where: { collectionId: req.params.id } });
      res.json({ saved: !existing, videoCount });
    } catch (err) {
      console.error('[collections] POST /collections/:id/save failed:', { collectionId: req.params.id, userId: req.userId, body: req.body, error: err.message, stack: err.stack });
      res.status(500).json({ error: 'Failed to update this save' });
    }
  })
);

// POST /collections/:id/collaborators — owner-only. Collaborators can add
// or remove *videos* (see /save above) but not other collaborators — that
// stays a flat, non-recursive invite tier the owner alone controls.
router.post(
  '/collections/:id/collaborators',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    try {
      const collection = await prisma.collection.findUnique({ where: { id: req.params.id }, select: { ownerId: true } });
      if (!collection) return res.status(404).json({ error: 'Collection not found' });
      if (collection.ownerId !== req.userId) return res.status(403).json({ error: 'Only the owner can add collaborators' });
      if (userId === collection.ownerId) return res.status(400).json({ error: 'The owner is already on this collection' });

      const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!target) return res.status(404).json({ error: 'User not found' });

      const collaborator = await prisma.collectionCollaborator.upsert({
        where: { collectionId_userId: { collectionId: req.params.id, userId } },
        create: { collectionId: req.params.id, userId },
        update: {},
        include: { user: { select: USER_SELECT } },
      });

      res.status(201).json({ ...collaborator.user, addedAt: collaborator.addedAt });
    } catch (err) {
      console.error('[collections] POST /collections/:id/collaborators failed:', { collectionId: req.params.id, userId: req.userId, body: req.body, error: err.message, stack: err.stack });
      res.status(500).json({ error: 'Failed to add collaborator' });
    }
  })
);

router.delete(
  '/collections/:id/collaborators/:userId',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const collection = await prisma.collection.findUnique({ where: { id: req.params.id }, select: { ownerId: true } });
      if (!collection) return res.status(404).json({ error: 'Collection not found' });
      // Owner can remove anyone; a collaborator may remove only themselves
      // (leave), matching the "co-curators can add/remove videos" spec —
      // never other people's membership.
      const isOwner = collection.ownerId === req.userId;
      const isSelf = req.params.userId === req.userId;
      if (!isOwner && !isSelf) return res.status(403).json({ error: "You don't have permission to remove this collaborator" });

      await prisma.collectionCollaborator.deleteMany({
        where: { collectionId: req.params.id, userId: req.params.userId },
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[collections] DELETE /collections/:id/collaborators/:userId failed:', { collectionId: req.params.id, userId: req.userId, error: err.message, stack: err.stack });
      res.status(500).json({ error: 'Failed to remove collaborator' });
    }
  })
);

export default router;
