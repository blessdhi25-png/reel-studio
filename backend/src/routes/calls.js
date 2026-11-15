import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { canMessage } from '../utils/messagingAccess.js';
import { emitToUser } from '../realtime/socket.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const STATUSES = ['COMPLETED', 'MISSED', 'DECLINED', 'NO_ANSWER'];
const TYPES = ['VOICE', 'VIDEO'];
const PEER_SELECT = { id: true, username: true, displayName: true, avatarUrl: true };

// Shapes a row for the viewer: who the "other person" is and which way the call went.
function present(log, meId) {
  const outgoing = log.callerId === meId;
  const { caller, receiver, ...rest } = log;
  return { ...rest, direction: outgoing ? 'outgoing' : 'incoming', peer: outgoing ? receiver : caller };
}

// For the receiver, a call the caller gave up on or that rang out is a missed call.
const MISSED_FOR_RECEIVER = ['MISSED', 'NO_ANSWER'];

// GET /calls[?peerId=<userId>]  — my call history (newest first) + unread missed-call count.
router.get('/calls', requireAuth, asyncHandler(async (req, res) => {
  const me = req.userId;
  const peerId = typeof req.query.peerId === 'string' ? req.query.peerId : null;

  const where = peerId
    ? { OR: [{ callerId: me, receiverId: peerId }, { callerId: peerId, receiverId: me }] }
    : { OR: [{ callerId: me }, { receiverId: me }] };

  const [rows, user] = await Promise.all([
    prisma.callLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { caller: { select: PEER_SELECT }, receiver: { select: PEER_SELECT } },
    }),
    prisma.user.findUnique({ where: { id: me }, select: { callsSeenAt: true } }),
  ]);

  const missedCount = await prisma.callLog.count({
    where: {
      receiverId: me,
      status: { in: MISSED_FOR_RECEIVER },
      ...(user?.callsSeenAt ? { createdAt: { gt: user.callsSeenAt } } : {}),
    },
  });

  res.json({ calls: rows.map((r) => present(r, me)), missedCount });
}));

// POST /calls — written by the CALLER's client when a call ends, is declined or rings out.
router.post('/calls', requireAuth, asyncHandler(async (req, res) => {
  const me = req.userId;
  const { callId, receiverId } = req.body || {};
  const callType = String(req.body?.callType || '').toUpperCase();
  const status = String(req.body?.status || '').toUpperCase();
  const durationSeconds = Math.max(0, Math.min(24 * 3600, Math.floor(Number(req.body?.durationSeconds) || 0)));

  if (typeof receiverId !== 'string' || receiverId === me) return res.status(400).json({ error: 'Invalid receiver' });
  if (!TYPES.includes(callType)) return res.status(400).json({ error: 'Invalid callType' });
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (callId != null && (typeof callId !== 'string' || callId.length > 64)) {
    return res.status(400).json({ error: 'Invalid callId' });
  }

  if (callId) {
    const existing = await prisma.callLog.findUnique({ where: { callId } });
    if (existing) return res.status(200).json(existing); // idempotent retry
  }
  // Same rule as ringing someone: blocked / closed-DM users can't be logged against.
  if (!(await canMessage(me, receiverId))) return res.status(403).json({ error: "You can't call this person" });

  const created = await prisma.callLog.create({
    data: {
      callId: callId || null,
      callerId: me,
      receiverId,
      callType,
      status,
      // A call that never connected has no duration, whatever the client sent.
      durationSeconds: status === 'COMPLETED' ? durationSeconds : 0,
    },
    include: { caller: { select: PEER_SELECT }, receiver: { select: PEER_SELECT } },
  });

  // Live-update both sides' open DM threads and Calls tabs.
  emitToUser(me, 'call:logged', present(created, me));
  emitToUser(receiverId, 'call:logged', present(created, receiverId));

  res.status(201).json(present(created, me));
}));

// POST /calls/seen — opening the Calls tab clears the missed-call badge.
router.post('/calls/seen', requireAuth, asyncHandler(async (req, res) => {
  await prisma.user.update({ where: { id: req.userId }, data: { callsSeenAt: new Date() } });
  res.json({ ok: true });
}));

export default router;
