import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { notify } from '../utils/notify.js';
import { isBlocked } from './privacy.js';
import { emitToUser } from '../realtime/socket.js';

const router = Router();

// Messaging is allowed if either side follows the other — mirrors "chat with
// your followers", but also lets you message people you follow back.
// senderId is whoever is trying to send — the receiver's messagePrivacy
// setting is what governs whether they can be reached.
async function canMessage(senderId, receiverId) {
  if (await isBlocked(senderId, receiverId)) return false;

  const receiver = await prisma.user.findUnique({
    where: { id: receiverId },
    select: { messagePrivacy: true },
  });
  if (!receiver) return false;
  if (receiver.messagePrivacy === 'none') return false;
  if (receiver.messagePrivacy === 'everyone') return true;

  // 'followers' (default): sender and receiver must follow each other in
  // at least one direction.
  const follow = await prisma.follow.findFirst({
    where: {
      OR: [
        { followerId: senderId, followeeId: receiverId },
        { followerId: receiverId, followeeId: senderId },
      ],
    },
  });
  return !!follow;
}

// List conversations: one row per person you've exchanged messages with,
// most recent message first, with an unread count.
router.get('/conversations', requireAuth, async (req, res) => {
  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: req.userId }, { receiverId: req.userId }] },
    orderBy: { createdAt: 'desc' },
    take: 500, // fine at MVP scale; move to a real conversations table if this gets busy
    include: {
      sender: { select: { id: true, username: true, avatarUrl: true } },
      receiver: { select: { id: true, username: true, avatarUrl: true } },
    },
  });

  const byOtherUser = new Map();
  for (const m of messages) {
    const otherUser = m.senderId === req.userId ? m.receiver : m.sender;
    if (!byOtherUser.has(otherUser.id)) {
      byOtherUser.set(otherUser.id, {
        user: otherUser,
        lastMessage: m.content,
        lastMessageAt: m.createdAt,
        unreadCount: 0,
      });
    }
    if (m.receiverId === req.userId && !m.read) {
      byOtherUser.get(otherUser.id).unreadCount += 1;
    }
  }

  res.json(Array.from(byOtherUser.values()));
});

// Fetch a thread with one specific user, and mark their messages to you as read.
router.get('/conversations/:otherUserId', requireAuth, async (req, res) => {
  const { otherUserId } = req.params;

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: req.userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: req.userId },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });

  await prisma.message.updateMany({
    where: { senderId: otherUserId, receiverId: req.userId, read: false },
    data: { read: true },
  });
  // Let the original sender's open thread (if any) flip their sent-message
  // checkmarks to "read" live, instead of waiting on their next poll.
  emitToUser(otherUserId, 'message:read', { byUserId: req.userId });

  res.json(messages);
});

router.post('/conversations/:otherUserId', requireAuth, async (req, res) => {
  const { otherUserId } = req.params;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'content is required' });
  }
  if (otherUserId === req.userId) {
    return res.status(400).json({ error: "Can't message yourself" });
  }

  const allowed = await canMessage(req.userId, otherUserId);
  if (!allowed) {
    return res.status(403).json({ error: "You can't message this person" });
  }

  const message = await prisma.message.create({
    data: { senderId: req.userId, receiverId: otherUserId, content: content.trim() },
  });

  const actor = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, avatarUrl: true } });
  emitToUser(otherUserId, 'message:new', { ...message, sender: { id: req.userId, ...actor } });
  notify({
    userId: otherUserId,
    actorId: req.userId,
    type: 'message',
    content: `New message from @${actor.username}`,
    targetType: 'user',
    targetId: req.userId,
  });

  res.status(201).json(message);
});

export default router;
