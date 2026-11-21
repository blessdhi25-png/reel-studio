import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { pushConfigured, sendPushToUser, vapidPublicKey } from '../utils/push.js';

// Device (Web Push) notifications. Mounted at /api/v1/push.
const router = Router();
const MAX_DEVICES = 10;
const testLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.userId || req.ip, message: { error: 'Too many test notifications. Try again in a minute.' } });

// The public key is not a secret; serving it lets the frontend work without a second env var.
router.get('/config', requireAuth, (_req, res) => {
  res.json({ enabled: pushConfigured(), publicKey: pushConfigured() ? vapidPublicKey() : null });
});

router.get('/status', requireAuth, asyncHandler(async (req, res) => {
  res.json({ enabled: pushConfigured(), devices: await prisma.pushSubscription.count({ where: { userId: req.userId } }) });
}));

router.post('/subscribe', requireAuth, asyncHandler(async (req, res) => {
  if (!pushConfigured()) return res.status(503).json({ error: 'Push notifications aren’t set up on this server yet.' });
  const sub = req.body?.subscription || req.body || {};
  const endpoint = sub.endpoint;
  const p256dh = sub.keys?.p256dh || sub.p256dh;
  const auth = sub.keys?.auth || sub.auth;
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 2000 || typeof p256dh !== 'string' || typeof auth !== 'string') {
    return res.status(400).json({ error: 'Invalid push subscription.' });
  }
  const userAgent = typeof req.body?.userAgent === 'string' ? req.body.userAgent.slice(0, 300) : (req.headers['user-agent'] || '').slice(0, 300);

  // The endpoint identifies a browser profile: if someone else signs in there, the subscription moves to them.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: req.userId, endpoint, p256dh, auth, userAgent },
    update: { userId: req.userId, p256dh, auth, userAgent },
  });
  // Cap devices per account (oldest dropped first).
  const all = await prisma.pushSubscription.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  if (all.length > MAX_DEVICES) await prisma.pushSubscription.deleteMany({ where: { id: { in: all.slice(MAX_DEVICES).map((s) => s.id) } } });
  res.status(201).json({ ok: true, devices: Math.min(all.length, MAX_DEVICES) });
}));

router.delete('/unsubscribe', requireAuth, asyncHandler(async (req, res) => {
  const endpoint = req.body?.endpoint || req.query.endpoint;
  if (typeof endpoint !== 'string') return res.status(400).json({ error: 'endpoint is required.' });
  const { count } = await prisma.pushSubscription.deleteMany({ where: { userId: req.userId, endpoint } });
  res.json({ removed: count });
}));

router.post('/test', requireAuth, testLimiter, asyncHandler(async (req, res) => {
  if (!pushConfigured()) return res.status(503).json({ error: 'Push notifications aren’t set up on this server yet.' });
  const sent = await sendPushToUser(req.userId, {
    title: 'ClipPulse test notification',
    body: 'Device notifications are working. 🎉',
    url: '/settings/notifications',
    tag: 'push-test',
    type: 'test',
  });
  if (!sent) return res.status(404).json({ error: 'No registered device accepted the notification. Turn Device notifications off and on again.' });
  res.json({ sent });
}));

export default router;
