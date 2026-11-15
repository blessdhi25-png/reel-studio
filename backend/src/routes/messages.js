import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { notify } from '../utils/notify.js';
import { canMessage } from '../utils/messagingAccess.js';
import { emitToUser } from '../realtime/socket.js';
import { uploadMessageAttachment } from '../utils/upload.js';

const router = Router();

// ---- helpers ----
const REPLY_SELECT = {
  id: true,
  senderId: true,
  content: true,
  attachmentType: true,
  attachmentName: true,
  deletedForAll: true,
  sender: { select: { username: true } },
};
const withReply = { replyTo: { select: REPLY_SELECT } };

// Messages the viewer hid with "Delete for me".
const notHiddenFor = (me) => ({
  NOT: { OR: [{ senderId: me, deletedBySender: true }, { receiverId: me, deletedByReceiver: true }] },
});

// Client shape: deleted-for-everyone messages come back blanked, and the quoted parent is a small snapshot.
function present(m) {
  const { deletedBySender, deletedByReceiver, replyTo, ...rest } = m;
  const gone = m.deletedForAll;
  return {
    ...rest,
    deleted: gone,
    ...(gone && { content: '', attachmentUrl: null, attachmentType: null, attachmentName: null, attachmentSize: null, replyTo: null }),
    ...(!gone && {
      replyTo: replyTo
        ? {
            id: replyTo.id,
            senderId: replyTo.senderId,
            senderUsername: replyTo.sender?.username,
            deleted: replyTo.deletedForAll,
            content: replyTo.deletedForAll ? '' : (replyTo.content || '').slice(0, 200),
            attachmentType: replyTo.deletedForAll ? null : replyTo.attachmentType,
            attachmentName: replyTo.deletedForAll ? null : replyTo.attachmentName,
          }
        : null,
    }),
  };
}

// List conversations: one row per person you've exchanged messages with,
// most recent message first, with an unread count.
router.get('/conversations', requireAuth, async (req, res) => {
  const messages = await prisma.message.findMany({
    where: { AND: [{ OR: [{ senderId: req.userId }, { receiverId: req.userId }] }, notHiddenFor(req.userId)] },
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
        lastMessage: m.deletedForAll
          ? 'This message was deleted'
          : m.content || (m.attachmentUrl ? `📎 ${m.attachmentName || 'Attachment'}` : ''),
        lastMessageAt: m.createdAt,
        unreadCount: 0,
      });
    }
    if (m.receiverId === req.userId && !m.read && !m.deletedForAll) {
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
      AND: [
        {
          OR: [
            { senderId: req.userId, receiverId: otherUserId },
            { senderId: otherUserId, receiverId: req.userId },
          ],
        },
        notHiddenFor(req.userId),
      ],
    },
    orderBy: { createdAt: 'asc' },
    include: withReply,
  });

  await prisma.message.updateMany({
    where: { senderId: otherUserId, receiverId: req.userId, read: false },
    data: { read: true },
  });
  // Let the original sender's open thread (if any) flip their sent-message
  // checkmarks to "read" live, instead of waiting on their next poll.
  emitToUser(otherUserId, 'message:read', { byUserId: req.userId });

  res.json(messages.map(present));
});

// Accepts JSON ({ content }) or multipart (content + one `attachment` file).
// multer only runs for multipart requests, so existing JSON clients are unaffected.
function maybeAttachment(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  uploadMessageAttachment.single('attachment')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    next();
  });
}

router.post('/conversations/:otherUserId', requireAuth, maybeAttachment, async (req, res) => {
  const { otherUserId } = req.params;
  const me = req.userId;
  let content = (req.body.content || '').trim();
  const file = req.file;
  const replyToId = typeof req.body.replyToId === 'string' && req.body.replyToId ? req.body.replyToId : null;
  const forwardMessageId =
    typeof req.body.forwardMessageId === 'string' && req.body.forwardMessageId ? req.body.forwardMessageId : null;

  if (otherUserId === me) {
    return res.status(400).json({ error: "Can't message yourself" });
  }

  // Forwarding copies text + attachment from a message the requester can still see.
  let forwardData = null;
  if (forwardMessageId) {
    const src = await prisma.message.findFirst({
      where: {
        id: forwardMessageId,
        deletedForAll: false,
        AND: [{ OR: [{ senderId: me }, { receiverId: me }] }, notHiddenFor(me)],
      },
    });
    if (!src) return res.status(404).json({ error: 'Message to forward not found' });
    content = content || src.content;
    forwardData = {
      forwarded: true,
      attachmentUrl: src.attachmentUrl,
      attachmentType: src.attachmentType,
      attachmentName: src.attachmentName,
      attachmentSize: src.attachmentSize,
    };
  }

  if (!content && !file && !forwardData?.attachmentUrl) {
    return res.status(400).json({ error: 'content or an attachment is required' });
  }

  const allowed = await canMessage(me, otherUserId);
  if (!allowed) {
    return res.status(403).json({ error: "You can't message this person" });
  }

  // A reply must quote a message from THIS conversation.
  if (replyToId) {
    const parent = await prisma.message.findFirst({
      where: {
        id: replyToId,
        OR: [
          { senderId: me, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: me },
        ],
      },
      select: { id: true },
    });
    if (!parent) return res.status(400).json({ error: 'The message you are replying to no longer exists' });
  }

  const created = await prisma.message.create({
    data: {
      senderId: me,
      receiverId: otherUserId,
      content,
      ...(replyToId && { replyToId }),
      ...(forwardData || {}),
      ...(file && {
        attachmentUrl: file.path,
        attachmentType: file.mimetype.startsWith('image/')
          ? 'image'
          : file.mimetype.startsWith('video/')
          ? 'video'
          : 'file',
        attachmentName: (file.originalname || 'file').slice(0, 200),
        attachmentSize: file.size,
      }),
    },
    include: withReply,
  });
  const message = present(created);

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

// DELETE /messages/:id?scope=me|everyone
//  me        — hide it for the caller only (either side can do this)
//  everyone  — sender only: blank the message for both people ("This message was deleted")
router.delete('/messages/:id', requireAuth, async (req, res) => {
  const me = req.userId;
  const scope = req.query.scope === 'everyone' ? 'everyone' : 'me';
  const m = await prisma.message.findUnique({ where: { id: req.params.id } });
  if (!m || (m.senderId !== me && m.receiverId !== me)) {
    return res.status(404).json({ error: 'Message not found' });
  }
  const otherId = m.senderId === me ? m.receiverId : m.senderId;

  if (scope === 'everyone') {
    if (m.senderId !== me) return res.status(403).json({ error: 'You can only delete your own messages for everyone' });
    await prisma.message.update({
      where: { id: m.id },
      data: { deletedForAll: true, content: '', attachmentUrl: null, attachmentType: null, attachmentName: null, attachmentSize: null },
    });
    emitToUser(otherId, 'message:deleted', { id: m.id, forEveryone: true });
    emitToUser(me, 'message:deleted', { id: m.id, forEveryone: true });
  } else {
    await prisma.message.update({
      where: { id: m.id },
      data: m.senderId === me ? { deletedBySender: true } : { deletedByReceiver: true },
    });
    emitToUser(me, 'message:deleted', { id: m.id, forEveryone: false }); // my other tabs/devices
  }
  res.json({ ok: true, id: m.id, scope });
});

export default router;
