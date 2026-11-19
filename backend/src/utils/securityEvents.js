import prisma from '../config/db.js';

/** Fire-and-forget log of a security-relevant account change (shown under Help Centre → Security alerts). */
export function recordSecurityEvent(userId, type) {
  prisma.securityEvent
    .create({ data: { userId, type } })
    .catch((err) => console.error('[securityEvents] could not record', type, err.message));
}
