import { Router } from 'express';
import stripe from '../config/stripe.js';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Wraps a Stripe call so a bad/missing API key or any Stripe-side failure
// returns a clean 502 to the client instead of crashing the whole process.
function handleStripeError(res, err) {
  console.error('[stripe] request failed:', err.message);
  if (err.statusCode === 401 || err.type === 'StripeAuthenticationError') {
    return res.status(502).json({
      error: 'Payments are not configured correctly on the server (invalid Stripe API key). Contact the site admin.',
    });
  }
  return res.status(502).json({ error: 'Payment provider error — please try again shortly.' });
}

// Step 1: creator starts (or resumes) Connect Express onboarding.
router.post('/stripe/connect', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });

    let accountId = user.stripeAccountId;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: user.email,
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
      });
      accountId = account.id;
      await prisma.user.update({ where: { id: user.id }, data: { stripeAccountId: accountId } });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${FRONTEND_URL}/earnings?connect=refresh`,
      return_url: `${FRONTEND_URL}/earnings?connect=done`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (err) {
    handleStripeError(res, err);
  }
});

// Poll this after returning from onboarding to see if payouts are enabled.
router.get('/stripe/status', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user.stripeAccountId) {
      return res.json({ connected: false, payoutsEnabled: false });
    }

    const account = await stripe.accounts.retrieve(user.stripeAccountId);
    const payoutsEnabled = account.payouts_enabled;

    if (payoutsEnabled && !user.stripeOnboarded) {
      await prisma.user.update({ where: { id: user.id }, data: { stripeOnboarded: true } });
    }

    res.json({ connected: true, payoutsEnabled, detailsSubmitted: account.details_submitted });
  } catch (err) {
    handleStripeError(res, err);
  }
});

// Link to the Stripe-hosted Express dashboard (balance, payout history, bank details).
router.post('/stripe/dashboard-link', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user.stripeAccountId) {
      return res.status(400).json({ error: 'Connect a payout account first' });
    }
    const link = await stripe.accounts.createLoginLink(user.stripeAccountId);
    res.json({ url: link.url });
  } catch (err) {
    handleStripeError(res, err);
  }
});

// Creates a Checkout Session for a tip. Money moves via a destination charge:
// the platform takes a small application fee, the rest transfers to the
// creator's connected account directly.
router.post('/videos/:id/tip/checkout', requireAuth, async (req, res) => {
  try {
    const { amountCents } = req.body;
    if (!amountCents || amountCents < 50) {
      return res.status(400).json({ error: 'amountCents must be at least 50 ($0.50)' });
    }

    const video = await prisma.video.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (!video) return res.status(404).json({ error: 'Video not found' });
    if (video.userId === req.userId) {
      return res.status(400).json({ error: 'Cannot tip your own video' });
    }
    if (!video.user.stripeAccountId || !video.user.stripeOnboarded) {
      return res.status(400).json({ error: 'This creator has not set up payouts yet' });
    }

    const applicationFeeCents = Math.round(amountCents * 0.1); // platform keeps 10%

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: { name: `Tip for @${video.user.username}` },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        transfer_data: { destination: video.user.stripeAccountId },
      },
      metadata: {
        videoId: video.id,
        senderId: req.userId,
        receiverId: video.userId,
      },
      success_url: `${FRONTEND_URL}/tip/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/tip/cancel`,
    });

    // Record as pending; the webhook flips it to completed once Stripe confirms payment.
    await prisma.transaction.create({
      data: {
        senderId: req.userId,
        receiverId: video.userId,
        videoId: video.id,
        amountCents,
        type: 'tip',
        status: 'pending',
        stripeSessionId: session.id,
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    handleStripeError(res, err);
  }
});

export default router;
