import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Platform policies (Community Guidelines, Privacy Policy, Terms of Service).
//   GET /policies/:slug   public — anyone may read the current text
//   PUT /policies/:slug   admin or moderator only (403 otherwise) — edits go live immediately
// Role values are lowercase in this codebase (UserRole enum: user | moderator | admin).
const router = Router();

export const POLICY_SLUGS = {
  'community-guidelines': 'Community Guidelines',
  'privacy-policy': 'Privacy Policy',
  'terms-of-service': 'Terms of Service',
};
const MAX_TITLE = 120;
const MAX_CONTENT = 60000;

const present = (p) => ({
  slug: p.slug,
  title: p.title,
  content: p.content,
  updatedAt: p.updatedAt,
  updatedBy: p.updatedBy?.username || null,
});

router.get('/:slug', asyncHandler(async (req, res) => {
  const { slug } = req.params;
  if (!Object.prototype.hasOwnProperty.call(POLICY_SLUGS, slug)) return res.status(404).json({ error: 'Policy not found' });
  const row = await prisma.platformPolicy.findUnique({
    where: { slug },
    include: { updatedBy: { select: { username: true } } },
  });
  res.set('Cache-Control', 'no-cache');
  // No row yet: the frontend falls back to its bundled default copy (content: null).
  if (!row) return res.json({ slug, title: POLICY_SLUGS[slug], content: null, updatedAt: null, updatedBy: null });
  res.json(present(row));
}));

router.put('/:slug', requireAuth, requireRole('admin', 'moderator'), asyncHandler(async (req, res) => {
  const { slug } = req.params;
  if (!Object.prototype.hasOwnProperty.call(POLICY_SLUGS, slug)) return res.status(404).json({ error: 'Policy not found' });

  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : POLICY_SLUGS[slug];
  const content = typeof req.body?.content === 'string' ? req.body.content.replace(/\r\n/g, '\n').trim() : '';
  if (!title || title.length > MAX_TITLE) return res.status(400).json({ error: `Title must be 1–${MAX_TITLE} characters.` });
  if (!content) return res.status(400).json({ error: 'Policy text can’t be empty.' });
  if (content.length > MAX_CONTENT) return res.status(400).json({ error: `Policy text is too long (max ${MAX_CONTENT} characters).` });

  const row = await prisma.platformPolicy.upsert({
    where: { slug },
    create: { slug, title, content, updatedById: req.userId },
    update: { title, content, updatedById: req.userId },
    include: { updatedBy: { select: { username: true } } },
  });
  res.json(present(row));
}));

export default router;
