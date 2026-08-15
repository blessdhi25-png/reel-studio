// backend/src/services/recommendation.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getPersonalizedFeed(userId, limit = 10, cursor = null) {
  // 1. Fetch top tags the user engages with
  const userInterests = await prisma.userInterest.findMany({
    where: { userId },
    orderBy: { weight: 'desc' },
    take: 5,
  });

  const preferredTags = userInterests.map((i) => i.tag);

  // 2. Fetch candidate videos
  const videos = await prisma.video.findMany({
    take: limit + 1,
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, username: true, avatarUrl: true } },
      _count: { select: { likes: true, comments: true } },
    },
  });

  // 3. Score and rank candidates
  const scoredVideos = videos.map((video) => {
    let score = (video._count.likes * 3) + (video._count.comments * 2);
    
    // Tag Boost
    if (video.tags && video.tags.some((tag) => preferredTags.includes(tag))) {
      score *= 2.5;
    }

    // Time Decay (Fresher content ranks higher)
    const hoursOld = (Date.now() - new Date(video.createdAt).getTime()) / (1000 * 3600);
    const decay = Math.exp(-0.05 * hoursOld);

    return { ...video, score: score * decay };
  });

  // Sort by calculated recommendation score
  scoredVideos.sort((a, b) => b.score - a.score);

  const hasNext = scoredVideos.length > limit;
  const items = hasNext ? scoredVideos.slice(0, limit) : scoredVideos;

  return {
    videos: items,
    nextCursor: hasNext ? items[items.length - 1].id : null,
  };
}

module.exports = { getPersonalizedFeed };
