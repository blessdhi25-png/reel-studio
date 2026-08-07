import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Tips and payouts now go through Stripe — see routes/payments.js for
// /videos/:id/tip/checkout, /stripe/connect, and /stripe/dashboard-link.
// This route just reads the ledger those flows write to.
router.get('/users/me/earnings', requireAuth, async (req, res) => {
  const earnings = await prisma.transaction.findMany({
    where: { receiverId: req.userId, status: 'completed' },
    orderBy: { createdAt: 'desc' },
  });
  const totalCents = earnings.reduce((sum, t) => sum + t.amountCents, 0);
  res.json({ totalCents, transactions: earnings });
});

export default router;
