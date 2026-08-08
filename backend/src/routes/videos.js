import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { upload } from '../utils/upload.js';
import { applyFeedTuning } from '../utils/feedTuning.js';
import { ALLOWED_CIRCLES, normalizeCircle } from '../utils/circles.js';

const router = Router();

// Step 1: client uploads the raw file directly to this endpoint (self-hosted MVP).
// Later, swap this for a pre-signed S3/MediaConvert URL without changing the contract below.
router.post('/', requireAuth, upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'video file is required' });

  const { caption, videoType, circle, trackId } = req.body;

  // Silently drop anything that isn't one of the curated circles rather than
  // erroring — an unset/unrecognized circle just means "uncategorized."
  const normalizedCircle = normalizeCircle(circle);

  // A trackId that doesn't resolve to a real distributed track is dropped
  // rather than erroring the whole upload over it.
  let validTrackId = null;
  if (trackId) {
    const track = await prisma.track.findUnique({ where: { id: trackId }, select: { id: true } });
    if (track) validTrackId = track.id;
  }

  // The raw upload is immediately servable from /uploads (see the static
  // route in server.js) even before the transcode worker finishes and calls
  // POST /:id/complete with the real HLS videoUrl — returning this now lets
  // the frontend show the just-posted clip right away instead of waiting on
  // background processing. APP_URL is preferred when set (the deployed
  // backend origin, e.g. https://reel-backend-a2sz.onrender.com); falling
  // back to building it from the incoming request works for local dev
  // without needing APP_URL set at all.
  const appOrigin = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const rawUrl = `${appOrigin}/uploads/${req.file.filename}`;

  // This app has no transcode worker running in local dev (nothing ever
  // calls POST /:id/complete), so leaving status as 'processing' meant
  // every upload sat invisible in the feed forever. Publishing immediately
  // with the raw file as videoUrl makes uploads viewable right away.
  // If/when a real transcode worker exists, it can still call
  // POST /:id/complete later to swap videoUrl for the real HLS rendition —
  // that update is harmless to apply on top of an already-published video.
  const video = await prisma.video.create({
    data: {
      userId: req.userId,
      videoType: videoType === 'long' ? 'long' : 'short',
      caption: caption || '',
      circle: normalizedCircle,
      trackId: validTrackId,
      rawPath: req.file.path,
      videoUrl: rawUrl,
      status: 'published',
    },
  });

  res.status(201).json({ id: video.id, status: video.status, circle: video.circle, rawUrl });
});

// The fixed list of circles plus a live published-video count for each, so
// the feed filter only ever shows communities that actually have content.
router.get('/circles', async (req, res) => {
  const counts = await prisma.video.groupBy({
    by: ['circle'],
    where: { status: 'published', circle: { not: null } },
    _count: { circle: true },
  });
  const countByCircle = Object.fromEntries(counts.map((c) => [c.circle, c._count.circle]));

  const circles = ALLOWED_CIRCLES
    .map((circle) => ({ circle, count: countByCircle[circle] || 0 }))
    .filter((c) => c.count > 0);

  res.json(circles);
});

// Step 2: the transcode worker calls this once HLS renditions are ready.
// In production, protect this with a service-to-service secret instead of user auth.
router.post('/:id/complete', requireAuth, async (req, res) => {
  const { videoUrl, thumbnailUrl, durationSeconds } = req.body;
  const video = await prisma.video.update({
    where: { id: req.params.id },
    data: { videoUrl, thumbnailUrl, durationSeconds, status: 'published' },
  });
  res.json(video);
});

router.get('/feed', optionalAuth, async (req, res) => {
  const {
    type, cursor, limit = 10, sort = 'ranked', circle, following,
    nicheWeight, freshWeight, localWeight, // localWeight accepted but unused — see feedTuning.js
  } = req.query;

  // Unrecognized circle values are ignored rather than erroring, so a stale
  // bookmarked/shared link degrades to "show everything" instead of a 400.
  const circleFilter = normalizeCircle(circle) ? { circle: normalizeCircle(circle) } : {};

  // Videos are published immediately on upload now (see POST / above), so
  // this mostly matters as a safety net: if a future transcode-worker
  // pipeline reintroduces a real 'processing' window, the uploader should
  // still see their own video in their feed while it's mid-processing —
  // everyone else only ever sees 'published' ones.
  const visibilityFilter = req.userId
    ? { OR: [{ status: 'published' }, { status: 'processing', userId: req.userId }] }
    : { status: 'published' };

  let followingFilter = {};
  if (following === 'true' || following === '1') {
    if (!req.userId) return res.status(401).json({ error: 'Log in to see videos from people you follow' });
    const follows = await prisma.follow.findMany({
      where: { followerId: req.userId },
      select: { followeeId: true },
    });
    followingFilter = { userId: { in: follows.map((f) => f.followeeId) } };
  }

  const hasTuning =
    sort === 'ranked' &&
    ((nicheWeight !== undefined && Number(nicheWeight) !== 50) ||
      (freshWeight !== undefined && Number(freshWeight) !== 50));

  const orderBy =
    sort === 'recent'
      ? [{ createdAt: 'desc' }]
      : [{ rankingScore: 'desc' }, { createdAt: 'desc' }];

  let videos, nextCursor;

  if (hasTuning) {
    // Tuning re-ranks a pool at request time, which isn't compatible with
    // stable cursor pagination (the pool's order changes based on the
    // sliders). So tuned requests return one un-paginated batch — fine for
    // an interactive "adjust sliders, see the feed change" UI; if you need
    // infinite-scroll *with* tuning later, the fix is to compute and store
    // per-video component scores (engagement, recency) so re-ranking a page
    // doesn't require pulling a whole candidate pool.
    const poolSize = Math.max(Number(limit) * 5, 50);
    const pool = await prisma.video.findMany({
      where: { ...visibilityFilter, ...(type ? { videoType: type } : {}), ...circleFilter, ...followingFilter },
      orderBy: [{ rankingScore: 'desc' }, { createdAt: 'desc' }],
      take: poolSize,
      include: { user: { select: { id: true, username: true, avatarUrl: true, stripeOnboarded: true } } },
    });
    videos = applyFeedTuning(pool, { nicheWeight, freshWeight }).slice(0, Number(limit));
    nextCursor = null;
  } else {
    videos = await prisma.video.findMany({
      where: { ...visibilityFilter, ...(type ? { videoType: type } : {}), ...circleFilter, ...followingFilter },
      orderBy,
      take: Number(limit),
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { user: { select: { id: true, username: true, avatarUrl: true, stripeOnboarded: true } } },
    });
    nextCursor = videos.length === Number(limit) ? videos[videos.length - 1].id : null;
  }

  let followedIds = new Set();
  let likedVideoIds = new Set();
  let bookmarkedVideoIds = new Set();
  if (req.userId) {
    const authorIds = [...new Set(videos.map((v) => v.userId))];
    const videoIds = videos.map((v) => v.id);
    const [follows, likes, bookmarks] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId: req.userId, followeeId: { in: authorIds } },
        select: { followeeId: true },
      }),
      prisma.like.findMany({
        where: { userId: req.userId, videoId: { in: videoIds } },
        select: { videoId: true },
      }),
      prisma.bookmark.findMany({
        where: { userId: req.userId, videoId: { in: videoIds } },
        select: { videoId: true },
      }),
    ]);
    followedIds = new Set(follows.map((f) => f.followeeId));
    likedVideoIds = new Set(likes.map((l) => l.videoId));
    bookmarkedVideoIds = new Set(bookmarks.map((b) => b.videoId));
  }
  const videosWithFollow = videos.map((v) => ({
    ...v,
    isLiked: likedVideoIds.has(v.id),
    isBookmarked: bookmarkedVideoIds.has(v.id),
    user: { ...v.user, isFollowing: followedIds.has(v.userId) },
  }));

  res.json({ videos: videosWithFollow, nextCursor });
});

router.get('/:id', async (req, res) => {
  const video = await prisma.video.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { id: true, username: true, avatarUrl: true, stripeOnboarded: true } } },
  });
  if (!video) return res.status(404).json({ error: 'Video not found' });
  res.json(video);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const video = await prisma.video.findUnique({ where: { id: req.params.id } });
  if (!video) return res.status(404).json({ error: 'Video not found' });
  if (video.userId !== req.userId) return res.status(403).json({ error: 'Not your video' });

  await prisma.video.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

router.post('/:id/view', optionalAuth, async (req, res) => {
  await prisma.video.update({
    where: { id: req.params.id },
    data: { viewCount: { increment: 1 } },
  });
  res.json({ ok: true });
});

// Logs a feed interaction (impression, watch_complete, skip, share) so the
// ranking worker can compute an engagement score. Fire-and-forget from the
// client — failures here should never block playback.
router.post('/:id/events', optionalAuth, async (req, res) => {
  const { eventType, watchDurationMs } = req.body;
  const validTypes = ['impression', 'watch_complete', 'skip', 'share'];
  if (!validTypes.includes(eventType)) {
    return res.status(400).json({ error: 'invalid eventType' });
  }

  await prisma.feedEvent.create({
    data: {
      videoId: req.params.id,
      userId: req.userId || null,
      eventType,
      watchDurationMs: watchDurationMs || null,
    },
  });
  res.status(201).json({ ok: true });
});

export default router;
