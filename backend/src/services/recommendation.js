import prisma from '../config/db.js';
import { recencyMultiplier } from '../utils/feedTuning.js';

// Pull more candidates than `limit` so there's something worth re-ranking —
// mirrors the same pool-then-score approach GET /videos/feed already uses
// for its tuned-sort branch (see routes/videos.js + utils/feedTuning.js).
const POOL_MULTIPLIER = 5;
const MIN_POOL_SIZE = 50;

// Component weights — likes count more than a raw view, comments (a
// heavier-effort signal) count more than a like. Mirrors the same
// engagement-weighting ratio utils/feedTuning.js's viralityOf() uses
// (likes x3, comments x4) rather than inventing a different scale here.
const LIKE_WEIGHT = 3;
const COMMENT_WEIGHT = 4;

// A video whose circle the viewer has no recorded UserInterest for (or a
// logged-out viewer) gets this neutral multiplier — same "50 = neutral,
// 1x" convention applyFeedTuning() uses, so an untracked tag never
// out-scores or under-scores a tracked one by default.
const NEUTRAL_TAG_WEIGHT = 1;

/**
 * Scores and orders a page of candidate videos for a personalized feed.
 *
 * Score = (likeCount * LIKE_WEIGHT + commentCount * COMMENT_WEIGHT + 1)
 *         * tagWeight (from UserInterest, keyed by the video's `circle`)
 *         * recencyMultiplier(createdAt) (same half-life decay curve the
 *           background ranking worker and feed-tuning both already use)
 *
 * Cursor pagination note: like GET /videos/feed's own tuned-sort branch,
 * re-ranking a pool at request time isn't perfectly compatible with stable
 * cursor pagination — a video's relative rank can shift between pages if
 * the underlying data changes between calls. What cursor *does* guarantee
 * here is that each page pulls a fresh, non-overlapping slice of the raw
 * candidate pool (via Prisma's cursor+skip), so the same video is never
 * returned twice across pages even though absolute ordering isn't
 * perfectly stable.
 *
 * @param {string|null|undefined} userId - viewer's id; personalization
 *   (tag weights) is skipped for a logged-out/unknown viewer, who still
 *   gets engagement + recency scoring.
 * @param {number} [limit=10] - page size.
 * @param {string} [cursor] - id of the last video from a previous page.
 * @returns {Promise<{ videos: object[], nextCursor: string|null }>}
 */
export async function getPersonalizedFeed(userId, limit = 10, cursor = undefined) {
  const take = Number(limit) > 0 ? Number(limit) : 10;
  const poolSize = Math.max(take * POOL_MULTIPLIER, MIN_POOL_SIZE);

  const [candidates, interests] = await Promise.all([
    prisma.video.findMany({
      where: { status: 'published' },
      orderBy: [{ createdAt: 'desc' }],
      take: poolSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        user: { select: { id: true, username: true, avatarUrl: true, stripeOnboarded: true } },
      },
    }),
    userId ? prisma.userInterest.findMany({ where: { userId } }) : Promise.resolve([]),
  ]);

  const tagWeightByTag = new Map(interests.map((i) => [i.tag, i.weight]));

  const scored = candidates.map((video) => {
    const engagementScore =
      Number(video.likeCount) * LIKE_WEIGHT + Number(video.commentCount) * COMMENT_WEIGHT + 1;
    const tagWeight = video.circle && tagWeightByTag.has(video.circle)
      ? tagWeightByTag.get(video.circle)
      : NEUTRAL_TAG_WEIGHT;
    const recommendationScore = engagementScore * tagWeight * recencyMultiplier(video.createdAt);
    return { ...video, recommendationScore };
  });

  scored.sort((a, b) => b.recommendationScore - a.recommendationScore);

  const videos = scored.slice(0, take);
  // Pool came back short of what we asked for -> we've reached the end of
  // published videos, not just the end of this page.
  const nextCursor = candidates.length === poolSize ? candidates[candidates.length - 1].id : null;

  return { videos, nextCursor };
}
