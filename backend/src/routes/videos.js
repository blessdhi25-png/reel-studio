import { notInPrivateCommunity } from '../utils/communityVisibility.js';
import { Router } from 'express';
import prisma from '../config/db.js';
import cloudinary from '../config/cloudinary.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { uploadVideoWithThumbnail, uploadPhoto } from '../utils/upload.js';
import { sanitizeTextOverlays } from '../utils/textOverlays.js';
import { deleteVideoCascade } from '../utils/deleteVideoCascade.js';
import { applyFeedTuning } from '../utils/feedTuning.js';
import { ALLOWED_CIRCLES, normalizeCircle } from '../utils/circles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { isLanguage } from '../utils/languages.js';

// A post's language: the uploader's pick if valid, else English.
const postLanguage = (v) => (isLanguage(v) ? v : 'en');

// Ranked feed boost for the viewer's preferred content languages (Settings → Language). Multiplies the
// stored rankingScore so a matching video outranks a similarly-scored one without burying great videos
// in other languages. The epsilon keeps matches ahead when scores are tied at 0.
const LANGUAGE_BOOST = 1.5;
const boosted = (v, match) => Number(v.rankingScore || 0) * (match ? LANGUAGE_BOOST : 1) + (match ? 1e-6 : 0);
const FEED_INCLUDE = {
  user: { select: { id: true, username: true, displayName: true, avatarUrl: true, stripeOnboarded: true } },
  track: { include: { artist: { select: { stageName: true } } } },
};

const router = Router();

// Step 1: client uploads the raw file directly to this endpoint (self-hosted MVP).
// Later, swap this for a pre-signed S3/MediaConvert URL without changing the contract below.
// Optional ?communityId= posts the video into that community's own feed.
// Validated BEFORE multer (the id travels in the query string, not the multipart
// body) so a rejected request never uploads a multi-hundred-MB file to Cloudinary.
// Public communities only for now: community videos currently also appear on
// global surfaces (feed, profiles, search), so posting into a private community
// would expose it. Lift this once those surfaces filter by community privacy.
async function resolveCommunityTarget(req, res, next) {
  try {
    const { communityId } = req.query;
    if (!communityId) return next();
    const community = await prisma.community.findUnique({
      where: { id: String(communityId) },
      select: { id: true, privacy: true },
    });
    if (!community) return res.status(404).json({ error: 'Community not found' });
    if (community.privacy !== 'public') {
      return res.status(403).json({ error: "Posting to private communities isn't supported yet" });
    }
    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: req.userId } },
      select: { userId: true },
    });
    if (!membership) return res.status(403).json({ error: 'Join this community to post in it' });
    req.communityTargetId = community.id;
    next();
  } catch (err) {
    next(err);
  }
}

router.post(
  '/',
  requireAuth,
  resolveCommunityTarget,
  uploadVideoWithThumbnail.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  asyncHandler(async (req, res) => {
    const videoFile = req.files?.video?.[0];
    if (!videoFile) return res.status(400).json({ error: 'video file is required' });
    const thumbnailFile = req.files?.thumbnail?.[0];

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

    // req.file.path is Cloudinary's permanent secure CDN URL (see
    // utils/upload.js) — the raw file was never written to this server's own
    // disk, so this no longer needs building from APP_URL/req.host. It's
    // immediately watchable this way even before the transcode worker
    // finishes and calls POST /:id/complete with the real HLS videoUrl, and
    // it's what the worker reads from (rawPath, below) as ffmpeg's input —
    // ffmpeg accepts an https:// URL directly, so nothing in
    // workers/transcode.js needed to change for this.
    const rawUrl = videoFile.path;

    // This app has no transcode worker running in local dev (nothing ever
    // calls POST /:id/complete), so leaving status as 'processing' meant
    // every upload sat invisible in the feed forever. Publishing immediately
    // with the raw file as videoUrl makes uploads viewable right away.
    // If/when a real transcode worker exists, it can still call
    // POST /:id/complete later to swap videoUrl for the real HLS rendition —
    // that update is harmless to apply on top of an already-published video.
    //
    // thumbnailUrl: same "no worker actually runs" reasoning applies here —
    // it used to only ever get set by that same never-called /:id/complete
    // step, so it stayed null forever. A poster frame generated client-side
    // (see app/upload/page.jsx's generateThumbnail) arrives here as the
    // optional `thumbnail` field instead; falling back to null when it's
    // missing (an old client build, or generation failed) rather than
    // erroring the whole upload over a missing thumbnail.
    const video = await prisma.video.create({
      data: {
        userId: req.userId,
        videoType: videoType === 'long' ? 'long' : 'short',
        caption: caption || '',
        language: postLanguage(req.body.language),
        circle: normalizedCircle,
        trackId: validTrackId,
        communityId: req.communityTargetId || null,
        rawPath: videoFile.path,
        videoUrl: rawUrl,
        thumbnailUrl: thumbnailFile?.path || null,
        textOverlays: sanitizeTextOverlays(req.body.textOverlays) ?? undefined,
        status: 'published',
      },
    });

    res.status(201).json({ id: video.id, status: video.status, circle: video.circle, communityId: video.communityId, rawUrl });
  })
);

// Photo posts. Same Video row as a video post (mediaType 'photo'): the image URL
// goes in videoUrl AND thumbnailUrl so every surface that lists videos — feed,
// profiles, search, collections — still has something to render.
router.post(
  '/photo',
  requireAuth,
  resolveCommunityTarget,
  uploadPhoto.single('photo'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'photo file is required' });
    const { caption, circle } = req.body;
    const url = req.file.path;
    const video = await prisma.video.create({
      data: {
        userId: req.userId,
        mediaType: 'photo',
        videoType: 'short',
        caption: caption || '',
        language: postLanguage(req.body.language),
        circle: normalizeCircle(circle),
        communityId: req.communityTargetId || null,
        rawPath: url,
        videoUrl: url,
        thumbnailUrl: url,
        textOverlays: sanitizeTextOverlays(req.body.textOverlays) ?? undefined,
        status: 'published',
      },
    });
    res.status(201).json({
      id: video.id, status: video.status, mediaType: 'photo', circle: video.circle,
      communityId: video.communityId, rawUrl: url, textOverlays: video.textOverlays,
    });
  })
);

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
      where: { ...visibilityFilter, ...(type ? { videoType: type } : {}), ...circleFilter, ...followingFilter, AND: [notInPrivateCommunity] },
      orderBy: [{ rankingScore: 'desc' }, { createdAt: 'desc' }],
      take: poolSize,
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, stripeOnboarded: true } },
        track: { include: { artist: { select: { stageName: true } } } },
      },
    });
    videos = applyFeedTuning(pool, { nicheWeight, freshWeight }).slice(0, Number(limit));
    nextCursor = null;
  } else {
    const where = { ...visibilityFilter, ...(type ? { videoType: type } : {}), ...circleFilter, ...followingFilter, AND: [notInPrivateCommunity] };
    const take = Number(limit);
    const prefLangs = sort === 'ranked' && req.userId
      ? (await prisma.user.findUnique({ where: { id: req.userId }, select: { contentLanguages: true } }))?.contentLanguages || []
      : [];

    if (prefLangs.length) {
      // Two streams, each already in (rankingScore, createdAt) order: videos in the viewer's languages and
      // everything else. Merge them by boosted score. The cursor is one id per stream ("l:<match>:<other>"),
      // so paging stays exact, with no offsets and no duplicates.
      const [, curM, curO] = typeof cursor === 'string' && cursor.startsWith('l:') ? cursor.split(':') : [];
      const stream = (extra, cur) => prisma.video.findMany({
        where: { ...where, ...extra },
        orderBy: [{ rankingScore: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        take,
        ...(cur ? { skip: 1, cursor: { id: cur } } : {}),
        include: FEED_INCLUDE,
      });
      const [m, o] = await Promise.all([
        stream({ language: { in: prefLangs } }, curM),
        stream({ language: { notIn: prefLangs } }, curO),
      ]);
      videos = [];
      let i = 0;
      let j = 0;
      while (videos.length < take && (i < m.length || j < o.length)) {
        const takeMatch = j >= o.length || (i < m.length && boosted(m[i], true) >= boosted(o[j], false));
        videos.push(takeMatch ? m[i++] : o[j++]);
      }
      const done = i >= m.length && j >= o.length && m.length < take && o.length < take;
      nextCursor = done ? null : `l:${(i ? m[i - 1].id : curM) || ''}:${(j ? o[j - 1].id : curO) || ''}`;
    } else {
      videos = await prisma.video.findMany({
        where,
        orderBy,
        take,
        // A language-feed cursor ('l:…') from before the viewer cleared their languages just restarts the page.
        ...(cursor && !String(cursor).startsWith('l:') ? { skip: 1, cursor: { id: cursor } } : {}),
        include: FEED_INCLUDE,
      });
      nextCursor = videos.length === take ? videos[videos.length - 1].id : null;
    }
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
    // Flatten to the same { id, title, audioUrl, artistName, durationSeconds }
    // shape GET /artists/tracks/search already returns, rather than leaking
    // Prisma's nested `track.artist.stageName` onto the wire.
    track: v.track
      ? {
          id: v.track.id,
          title: v.track.title,
          audioUrl: v.track.audioUrl,
          artistName: v.track.artist.stageName,
          durationSeconds: v.track.durationSeconds,
          coverUrl: v.track.coverUrl,
        }
      : null,
  }));

  res.json({ videos: videosWithFollow, nextCursor });
});

router.get('/:id', optionalAuth, async (req, res) => {
  const video = await prisma.video.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true, stripeOnboarded: true } },
      track: { include: { artist: { select: { stageName: true } } } },
    },
  });
  if (!video) return res.status(404).json({ error: 'Video not found' });
  // Viewer-specific flags, so a deep-linked clip (/?video=ID) renders with the right like/bookmark/follow state.
  let isLiked = false;
  let isBookmarked = false;
  let isFollowing = false;
  if (req.userId) {
    const [like, bookmark, follow] = await Promise.all([
      prisma.like.findFirst({ where: { userId: req.userId, videoId: video.id }, select: { videoId: true } }),
      prisma.bookmark.findFirst({ where: { userId: req.userId, videoId: video.id }, select: { videoId: true } }),
      prisma.follow.findFirst({ where: { followerId: req.userId, followeeId: video.userId }, select: { followeeId: true } }),
    ]);
    isLiked = !!like;
    isBookmarked = !!bookmark;
    isFollowing = !!follow;
  }
  res.json({
    ...video,
    isLiked,
    isBookmarked,
    user: { ...video.user, isFollowing },
    track: video.track
      ? {
          id: video.track.id,
          title: video.track.title,
          audioUrl: video.track.audioUrl,
          artistName: video.track.artist.stageName,
          durationSeconds: video.track.durationSeconds,
          coverUrl: video.track.coverUrl,
        }
      : null,
  });
});

router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const video = await prisma.video.findUnique({ where: { id: req.params.id } });
  if (!video) return res.status(404).json({ error: 'Video not found' });
  if (video.userId !== req.userId) return res.status(403).json({ error: 'Not your video' });

  // See utils/deleteVideoCascade.js — shared with the admin hard-takedown
  // route so both the Cloudinary cleanup and the FK-safe cascade delete
  // logic live in exactly one place.
  await deleteVideoCascade(video);

  res.json({ ok: true });
}));

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
