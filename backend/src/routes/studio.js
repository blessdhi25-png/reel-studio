import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import stripe from '../config/stripe.js';

const router = Router();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Boost tiers — flat platform fee, no creator payout involved (this is the
// platform's own product, unlike tips which move via Stripe Connect).
const BOOST_TIERS = {
  '24h': { hours: 24, amountCents: 299, label: '24 hours' },
  '3d': { hours: 72, amountCents: 699, label: '3 days' },
  '7d': { hours: 168, amountCents: 1499, label: '7 days' },
};

// TikTok Studio — creator's own analytics: totals across all their videos
// plus a per-video breakdown, newest first.
router.get('/studio/overview', requireAuth, async (req, res) => {
  const videos = await prisma.video.findMany({
    where: { userId: req.userId, status: { not: 'removed' } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, caption: true, thumbnailUrl: true, videoType: true, status: true,
      viewCount: true, likeCount: true, commentCount: true, bookmarkCount: true,
      rankingScore: true, boostedUntil: true, createdAt: true,
    },
  });

  const totals = videos.reduce(
    (acc, v) => {
      acc.views += Number(v.viewCount);
      acc.likes += Number(v.likeCount);
      acc.comments += Number(v.commentCount);
      acc.bookmarks += Number(v.bookmarkCount);
      return acc;
    },
    { views: 0, likes: 0, comments: 0, bookmarks: 0 }
  );

  const followerCount = await prisma.follow.count({ where: { followeeId: req.userId } });

  res.json({
    totals: { ...totals, videoCount: videos.length, followerCount },
    videos,
  });
});

router.get('/boost/tiers', requireAuth, (_req, res) => {
  res.json(
    Object.entries(BOOST_TIERS).map(([id, t]) => ({
      id,
      label: t.label,
      amountCents: t.amountCents,
    }))
  );
});

// Promote — pay to temporarily multiply a video's ranking score so it
// surfaces more in the feed. Money goes to the platform, not a creator
// payout, so this is a plain Checkout Session with no Connect transfer.
router.post('/videos/:id/boost/checkout', requireAuth, async (req, res) => {
  const { tier } = req.body;
  const config = BOOST_TIERS[tier];
  if (!config) {
    return res.status(400).json({ error: `tier must be one of: ${Object.keys(BOOST_TIERS).join(', ')}` });
  }

  const video = await prisma.video.findUnique({ where: { id: req.params.id } });
  if (!video) return res.status(404).json({ error: 'Video not found' });
  if (video.userId !== req.userId) {
    return res.status(403).json({ error: 'You can only promote your own videos' });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: config.amountCents,
          product_data: { name: `Boost — ${config.label}` },
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: 'boost',
      videoId: video.id,
      userId: req.userId,
      boostHours: String(config.hours),
    },
    success_url: `${FRONTEND_URL}/promote?boosted=1`,
    cancel_url: `${FRONTEND_URL}/promote`,
  });

  // receiverId has no real meaning for a platform purchase — record it against
  // the buyer so it still shows up in their own transaction history.
  await prisma.transaction.create({
    data: {
      senderId: req.userId,
      receiverId: req.userId,
      videoId: video.id,
      amountCents: config.amountCents,
      type: 'boost',
      status: 'pending',
      stripeSessionId: session.id,
    },
  });

  res.json({ url: session.url });
});

export default router;
