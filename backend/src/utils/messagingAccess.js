import prisma from '../config/db.js';
import { isBlocked } from '../routes/privacy.js';

// Messaging is allowed if either side follows the other — mirrors "chat with
// your followers", but also lets you message people you follow back.
// senderId is whoever is trying to send — the receiver's messagePrivacy
// setting is what governs whether they can be reached.
export async function canMessage(senderId, receiverId) {
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
