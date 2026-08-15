import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// totalViews/totalLikes are the same aggregate routes/studio.js already
// computes for GET /studio/overview (see its `totals` reducer there) — this
// stays a separate, narrower-payload endpoint per this feature's own spec
// rather than folding into studio's richer per-video response. Worth
// knowing the two overlap if you're deciding whether to consolidate later.
//
// averageWatchTimeSeconds reads from FeedEvent's existing watch_complete /
// watchDurationMs data (see routes/videos.js's POST /:id/events) rather
// than the new WatchLog model added alongside this controller — WatchLog
// is freshly scaffolded by that same change and nothing writes to it yet
// (no ingestion route was part of this request), so it would always
// average to 0. FeedEvent already has real data flowing into it today.
export const getCreatorAnalytics = asyncHandler(async (req, res) => {
  const [totals, watchEvents] = await Promise.all([
    prisma.video.aggregate({
      where: { userId: req.userId, status: { not: 'removed' } },
      _sum: { viewCount: true, likeCount: true },
    }),
    prisma.feedEvent.findMany({
      where: { eventType: 'watch_complete', video: { userId: req.userId } },
      select: { watchDurationMs: true },
    }),
  ]);

  const totalViews = Number(totals._sum.viewCount || 0);
  const totalLikes = Number(totals._sum.likeCount || 0);

  const durationsMs = watchEvents.map((e) => e.watchDurationMs).filter((ms) => ms != null);
  const averageWatchTimeSeconds = durationsMs.length
    ? Math.round(durationsMs.reduce((sum, ms) => sum + ms, 0) / durationsMs.length / 1000)
    : 0;

  res.json({ totalViews, totalLikes, averageWatchTimeSeconds });
});
