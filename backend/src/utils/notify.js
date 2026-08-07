import prisma from '../config/db.js';
import { pushNotification } from '../realtime/socket.js';

// Fire-and-forget notification creation — callers should not await-block
// their main response on this, just call it and move on.
export async function notify({ userId, actorId, type, content, targetType, targetId }) {
  if (userId === actorId) return; // don't notify yourself for your own actions
  try {
    const notification = await prisma.notification.create({
      data: { userId, actorId: actorId || null, type, content, targetType, targetId },
    });
    pushNotification(userId, notification);
  } catch (err) {
    console.error('[notify] failed to create notification:', err.message);
  }
}
