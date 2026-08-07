// Shared between the ranking worker (background base-score computation) and
// the /videos/feed endpoint (per-request re-rank using a user's tuning
// sliders). Keeping the recency math in one place means both stay in sync.

const RECENCY_HALF_LIFE_HOURS = 36; // score halves every ~1.5 days

export function recencyMultiplier(createdAt) {
  const ageHours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
  return Math.pow(0.5, ageHours / RECENCY_HALF_LIFE_HOURS);
}

/**
 * Re-ranks a pool of videos using two user-controlled sliders (0-100, 50 = neutral):
 *
 *  - nicheWeight: 0 = fully favor viral/high-engagement videos, 100 = fully
 *    favor niche/lower-engagement ones. Virality is approximated as each
 *    video's rank within the *current pool* by raw engagement (views/likes/
 *    comments) on a log scale — a cheap, request-time proxy, not a stored
 *    metric.
 *  - freshWeight: 0 = fully favor "evergreen" videos (older but still
 *    engaging), 100 = fully favor the newest videos. Freshness reuses the
 *    same recency-decay curve the background ranking worker uses.
 *
 * At the neutral midpoint (50/50) both adjustments are exactly 1x, so
 * default behavior is unchanged from the worker's base `rankingScore`.
 *
 * NOTE: `localWeight` (hyper-local vs global) is intentionally NOT applied
 * here yet. We don't have any location data on videos or users — no upload
 * geo-tag, no viewer location — so there's nothing real to weight by. The
 * slider exists in the UI and the param is accepted below so the frontend
 * contract is already in place, but it's a deliberate no-op until location
 * data exists (e.g. optional geo-tag at upload + approximate viewer
 * location). Wiring fake behavior in now would just be noise.
 */
export function applyFeedTuning(videos, { nicheWeight = 50, freshWeight = 50 }) {
  if (videos.length === 0) return videos;

  const n = Math.min(100, Math.max(0, Number(nicheWeight))) / 100; // 0..1
  const f = Math.min(100, Math.max(0, Number(freshWeight))) / 100; // 0..1

  // Virality proxy: log-scaled raw engagement, min-max normalized within
  // this pool only (0 = least engaged in the pool, 1 = most engaged).
  const engagementOf = (v) =>
    Math.log(Number(v.viewCount) + Number(v.likeCount) * 3 + Number(v.commentCount) * 4 + 1);
  const engagements = videos.map(engagementOf);
  const minE = Math.min(...engagements);
  const maxE = Math.max(...engagements);
  const spread = maxE - minE || 1; // avoid divide-by-zero when pool is uniform

  const scored = videos.map((video, i) => {
    const viralityPercentile = (engagements[i] - minE) / spread; // 0..1

    // nicheWeight=50 -> 1x always. Above 50, boosts low-virality videos and
    // penalizes high-virality ones (and vice versa below 50).
    const nicheAdjustment = 1 + (n - 0.5) * 2 * (1 - 2 * viralityPercentile);

    const freshnessPercentile = recencyMultiplier(video.createdAt); // 0..1, 1 = newest
    // freshWeight=50 -> 1x always. Above 50, boosts newer videos and
    // penalizes older ones (and vice versa below 50, favoring "evergreen").
    const freshAdjustment = 1 + (f - 0.5) * 2 * (2 * freshnessPercentile - 1);

    const tunedScore = Number(video.rankingScore) * nicheAdjustment * freshAdjustment;
    return { ...video, tunedScore };
  });

  scored.sort((a, b) => b.tunedScore - a.tunedScore);
  return scored;
}
