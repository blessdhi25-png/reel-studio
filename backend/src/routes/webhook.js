import { Router } from 'express';
import express from 'express';
import stripe from '../config/stripe.js';
import prisma from '../config/db.js';
import { notify } from '../utils/notify.js';
import { emitToUser, emitToRoom } from '../realtime/socket.js';

const router = Router();

// Mounted with express.raw() in server.js — Stripe's signature verification
// needs the untouched request body, so this route must NOT go through
// express.json() first.
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[webhook] signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const tx = await prisma.transaction.findUnique({ where: { stripeSessionId: session.id } });
      await prisma.transaction.updateMany({
        where: { stripeSessionId: session.id },
        data: { status: 'completed', stripePaymentIntentId: session.payment_intent },
      });

      if (session.metadata?.type === 'boost') {
        const hours = Number(session.metadata.boostHours || 24);
        const boostedUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
        await prisma.video.update({
          where: { id: session.metadata.videoId },
          data: { boostedUntil },
        });
        console.log(`[webhook] boost activated for video ${session.metadata.videoId} until ${boostedUntil.toISOString()}`);
        break;
      }

      if (session.metadata?.type === 'live_tip') {
        const { liveStreamId, senderId, receiverId, message } = session.metadata;
        emitToRoom(`live:${liveStreamId}`, 'live:tip', {
          senderId,
          amountCents: tx?.amountCents,
          message: message || '',
          at: new Date().toISOString(),
        });
        notify({
          userId: receiverId,
          actorId: senderId,
          type: 'tip',
          content: `You received a $${((tx?.amountCents || 0) / 100).toFixed(2)} live gift`,
          targetType: 'live',
          targetId: liveStreamId,
        });
        console.log(`[webhook] live tip completed for session ${session.id}`);
        break;
      }

      if (tx) {
        notify({
          userId: tx.receiverId,
          actorId: tx.senderId,
          type: 'tip',
          content: `You received a $${(tx.amountCents / 100).toFixed(2)} tip`,
          targetType: 'video',
          targetId: tx.videoId,
        });
        // Dedicated real-time event (separate from the notification bell)
        // so the frontend can pop a celebration banner immediately.
        emitToUser(tx.receiverId, 'tip:received', {
          amountCents: tx.amountCents,
          videoId: tx.videoId,
          senderId: tx.senderId,
        });
      }
      console.log(`[webhook] tip completed for session ${session.id}`);
      break;
    }
    case 'checkout.session.expired': {
      const session = event.data.object;
      await prisma.transaction.updateMany({
        where: { stripeSessionId: session.id },
        data: { status: 'failed' },
      });
      break;
    }
    case 'account.updated': {
      const account = event.data.object;
      await prisma.user.updateMany({
        where: { stripeAccountId: account.id },
        data: { stripeOnboarded: !!account.payouts_enabled },
      });
      break;
    }
    default:
      // Ignore other event types for now.
      break;
  }

  res.json({ received: true });
});

export default router;
