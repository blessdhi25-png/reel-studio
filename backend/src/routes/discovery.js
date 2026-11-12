import { notInPrivateCommunity } from '../utils/communityVisibility.js';
import { Router } from 'express';
import prisma from '../config/db.js';
import { optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Escapes LIKE wildcards so a search for "100%" matches the literal text
// instead of acting as a pattern.
function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Hashtags live inside Video.caption as free text (there's no Hashtag table),
// so they're extracted in SQL. DISTINCT per video means a caption that repeats
// a tag counts once; the count is "published videos using this tag".
// Returns [] on any failure so a hashtag hiccup never breaks search itself.
async function hashtagCounts({ contains = '', limit = 20 } = {}) {
  const pattern = `%${escapeLike(contains.toLowerCase())}%`;
  try {
    const rows = await prisma.$queryRaw`
      SELECT tag, COUNT(*)::int AS count
      FROM (
        SELECT DISTINCT v."id" AS id, lower(m[1]) AS tag
        FROM "Video" v, regexp_matches(v."caption", '#([[:alnum:]_]+)', 'g') AS m
        WHERE v."status" = 'published' AND v."caption" IS NOT NULL
          AND (v."communityId" IS NULL OR NOT EXISTS (
            SELECT 1 FROM "Community" c WHERE c."id" = v."communityId" AND c."privacy" = 'private'
          ))
      ) t
      WHERE tag LIKE ${pattern}
      GROUP BY tag
      ORDER BY count DESC, tag ASC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
  } catch (err) {
    console.error('hashtagCounts failed:', err.message);
    return [];
  }
}

router.get('/search', optionalAuth, asyncHandler(async (req, res) => {
  const q = (req.query.q || '').toString();
  if (!q.trim()) return res.json({ users: [], videos: [], hashtags: [] });

  const term = q.trim();

  const [users, videos, hashtags] = await Promise.all([
    prisma.user.findMany({
      where: { username: { contains: term.replace(/^[@#]/, ''), mode: 'insensitive' } },
      select: {
        id: true, username: true, displayName: true, avatarUrl: true, creatorStatus: true,
        _count: { select: { followers: true } },
      },
      take: 10,
    }),
    prisma.video.findMany({
      where: { status: 'published', caption: { contains: term, mode: 'insensitive' }, AND: [notInPrivateCommunity] },
      take: 10,
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    }),
    hashtagCounts({ contains: term.replace(/^#/, ''), limit: 10 }),
  ]);

  let followedIds = new Set();
  if (req.userId && users.length) {
    const rows = await prisma.follow.findMany({
      where: { followerId: req.userId, followeeId: { in: users.map((u) => u.id) } },
      select: { followeeId: true },
    });
    followedIds = new Set(rows.map((r) => r.followeeId));
  }

  res.json({
    users: users.map(({ _count, ...u }) => ({
      ...u,
      followerCount: _count.followers,
      isFollowing: followedIds.has(u.id),
    })),
    videos,
    hashtags,
  });
}));

router.get('/trending', asyncHandler(async (_req, res) => {
  // Simple v1: recent videos ranked by like count.
  // Swap for a Redis sorted-set-backed score once the feed_events pipeline exists.
  const videos = await prisma.video.findMany({
    where: { status: 'published', AND: [notInPrivateCommunity] },
    orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
    take: 20,
    include: { user: { select: { id: true, username: true, avatarUrl: true } } },
  });
  res.json(videos);
}));

// Most-used hashtags across published videos — powers the search page's
// default "Trending hashtags" list.
router.get('/trending/hashtags', asyncHandler(async (_req, res) => {
  res.json(await hashtagCounts({ limit: 20 }));
}));

export default router;
