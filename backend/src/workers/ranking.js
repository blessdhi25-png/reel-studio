import 'dotenv/config';
import prisma from '../config/db.js';
import { recencyMultiplier } from '../utils/feedTuning.js';

const POLL_INTERVAL_MS = 30_000; // recompute every 30s

// Weights: reward completions and shares heavily, likes/comments moderately,
// penalize skips. Tune these once you have real usage data.
const WEIGHTS = {
  view: 1,
  like: 3,
  comment: 4,
  share: 6,
  watch_complete: 5,
  skip: -2,
};

async function computeScores() {
  // Only rescoring published videos from the last 14 days keeps this cheap;
  // older videos decay toward zero anyway and don't need recomputing often.
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const videos = await prisma.video.findMany({
    where: { status: 'published', createdAt: { gte: cutoff } },
    select: {
      id: true, viewCount: true, likeCount: true, commentCount: true, createdAt: true,
      boostedUntil: true,
    },
  });

  if (videos.length === 0) return;

  const videoIds = videos.map((v) => v.id);
  const eventCounts = await prisma.feedEvent.groupBy({
    by: ['videoId', 'eventType'],
    where: { videoId: { in: videoIds } },
    _count: { _all: true },
  });

  const eventMap = {}; // videoId -> { eventType: count }
  for (const row of eventCounts) {
    eventMap[row.videoId] ??= {};
    eventMap[row.videoId][row.eventType] = row._count._all;
  }

  const updates = videos.map((video) => {
    const events = eventMap[video.id] || {};
    const rawScore =
      Number(video.viewCount) * WEIGHTS.view +
      Number(video.likeCount) * WEIGHTS.like +
      Number(video.commentCount) * WEIGHTS.comment +
      (events.share || 0) * WEIGHTS.share +
      (events.watch_complete || 0) * WEIGHTS.watch_complete +
      (events.skip || 0) * WEIGHTS.skip;

    const isBoosted = video.boostedUntil && new Date(video.boostedUntil) > new Date();
    const boostMultiplier = isBoosted ? 5 : 1; // Promote feature — paid, time-limited lift
    const score = rawScore * recencyMultiplier(video.createdAt) * boostMultiplier;
    return { id: video.id, score: Math.max(score, 0) };
  });

  await prisma.$transaction(
    updates.map((u) =>
      prisma.video.update({ where: { id: u.id }, data: { rankingScore: u.score } })
    )
  );

  console.log(`[ranking] rescored ${updates.length} videos`);
}

async function pollLoop() {
  while (true) {
    try {
      await computeScores();
    } catch (err) {
      console.error('[ranking] failed:', err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

console.log('[ranking] ranking worker started');
pollLoop();
