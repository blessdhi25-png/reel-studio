import { Router } from 'express';
import stripe from '../config/stripe.js';
import prisma from '../config/db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { notify } from '../utils/notify.js';

const router = Router();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const LIVE_CATEGORIES = ['Gaming', 'Music', 'Chatting', 'Tech'];

router.get('/live', optionalAuth, async (req, res) => {
  const { category } = req.query;
  const streams = await prisma.liveStream.findMany({
    where: { status: 'live', ...(LIVE_CATEGORIES.includes(category) ? { category } : {}) },
    orderBy: { startedAt: 'desc' },
    include: { host: { select: { id: true, username: true, avatarUrl: true } } },
  });
  res.json(streams);
});

router.get('/live/:id', optionalAuth, async (req, res) => {
  const stream = await prisma.liveStream.findUnique({
    where: { id: req.params.id },
    include: { host: { select: { id: true, username: true, avatarUrl: true } } },
  });
  if (!stream) return res.status(404).json({ error: 'Stream not found' });
  res.json(stream);
});

router.post('/live/start', requireAuth, async (req, res) => {
  const { title, category, tags } = req.body;

  // Prevent a host from having two streams live at once.
  const alreadyLive = await prisma.liveStream.findFirst({
    where: { hostId: req.userId, status: 'live' },
  });
  if (alreadyLive) {
    return res.status(400).json({ error: 'You already have a live stream running', id: alreadyLive.id });
  }

  const stream = await prisma.liveStream.create({
    data: {
      hostId: req.userId,
      title: title?.trim() || 'Untitled live stream',
      category: LIVE_CATEGORIES.includes(category) ? category : null,
      tags: Array.isArray(tags) ? tags.filter(Boolean).slice(0, 10).join(',') : null,
    },
  });

  const host = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
  const followers = await prisma.follow.findMany({
    where: { followeeId: req.userId },
    select: { followerId: true },
  });
  for (const f of followers) {
    notify({
      userId: f.followerId,
      actorId: req.userId,
      type: 'live_started',
      content: `@${host.username} just went live: "${stream.title}"`,
      targetType: 'live',
      targetId: stream.id,
    });
  }

  res.status(201).json(stream);
});

router.post('/live/:id/end', requireAuth, async (req, res) => {
  const stream = await prisma.liveStream.findUnique({ where: { id: req.params.id } });
  if (!stream) return res.status(404).json({ error: 'Stream not found' });
  if (stream.hostId !== req.userId) return res.status(403).json({ error: 'Not your stream' });

  const updated = await prisma.liveStream.update({
    where: { id: req.params.id },
    data: { status: 'ended', endedAt: new Date() },
  });
  res.json(updated);
});

// Gifts/tips sent from inside a live room. Same Stripe Connect destination-
// charge pattern as /videos/:id/tip/checkout (see routes/payments.js) — kept
// here instead of there because it needs the stream's host, not a video's.
// Note: Transaction has no liveStreamId column yet, so the DB row records
// sender/receiver/amount but not which stream it came from; the room chat
// ticker gets the live context via the Stripe session metadata + webhook
// socket broadcast instead. Add a migration if you need it queryable later.
router.post('/live/:id/tip/checkout', requireAuth, async (req, res) => {
  try {
    const { amountCents, message } = req.body;
    if (!amountCents || amountCents < 50) {
      return res.status(400).json({ error: 'amountCents must be at least 50 ($0.50)' });
    }

    const stream = await prisma.liveStream.findUnique({
      where: { id: req.params.id },
      include: { host: true },
    });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.status !== 'live') return res.status(400).json({ error: 'This stream has ended' });
    if (stream.hostId === req.userId) {
      return res.status(400).json({ error: 'Cannot tip your own stream' });
    }
    if (!stream.host.stripeAccountId || !stream.host.stripeOnboarded) {
      return res.status(400).json({ error: 'This host has not set up payouts yet' });
    }

    const applicationFeeCents = Math.round(amountCents * 0.1); // platform keeps 10%

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: { name: `Gift for @${stream.host.username}'s live stream` },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        transfer_data: { destination: stream.host.stripeAccountId },
      },
      metadata: {
        type: 'live_tip',
        liveStreamId: stream.id,
        senderId: req.userId,
        receiverId: stream.hostId,
        message: (message || '').slice(0, 140),
      },
      success_url: `${FRONTEND_URL}/tip/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/tip/cancel`,
    });

    await prisma.transaction.create({
      data: {
        senderId: req.userId,
        receiverId: stream.hostId,
        amountCents,
        type: 'tip',
        status: 'pending',
        stripeSessionId: session.id,
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[live tip] checkout failed:', err.message);
    res.status(502).json({ error: 'Payment provider error — please try again shortly.' });
  }
});

export default router;
