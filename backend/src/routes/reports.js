import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const VALID_TARGET_TYPES = ['video', 'user', 'comment'];
const VALID_REASONS = [
  'spam',
  'fraud_or_scam',
  'harassment_or_abuse',
  'impersonation',
  'intellectual_property',
  'child_safety',
  'sexual_content',
  'other',
];

router.post('/reports', requireAuth, async (req, res) => {
  const { targetType, targetId, reason, details } = req.body;

  if (!VALID_TARGET_TYPES.includes(targetType)) {
    return res.status(400).json({ error: 'invalid targetType' });
  }
  if (!VALID_REASONS.includes(reason)) {
    return res.status(400).json({ error: 'invalid reason' });
  }
  if (!targetId) {
    return res.status(400).json({ error: 'targetId is required' });
  }

  const report = await prisma.report.create({
    data: {
      reporterId: req.userId,
      targetType,
      targetId,
      reason,
      details: details || null,
    },
  });

  // Child-safety reports are the one category that should never sit in a
  // normal queue — log distinctly so it's easy to alert on separately from
  // the rest of the moderation queue.
  if (reason === 'child_safety') {
    console.warn(`[URGENT REPORT] child_safety report filed: ${report.id} on ${targetType} ${targetId}`);
  }

  res.status(201).json({ ok: true, id: report.id });
});

// Lets a reporter see the status of reports they've filed.
router.get('/reports/mine', requireAuth, async (req, res) => {
  const reports = await prisma.report.findMany({
    where: { reporterId: req.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(reports);
});

export default router;
