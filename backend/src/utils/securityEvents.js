import prisma from '../config/db.js';
import { sendPushToUser } from './push.js';

const LABELS = {
  sessions_revoked: 'You signed out of all other devices.',
  password_changed: 'Your password was changed.',
  biometric_enabled: 'Biometric lock was turned on.',
};

/** Fire-and-forget log of a security-relevant account change (shown under Help Centre → Security alerts). */
export function recordSecurityEvent(userId, type) {
  prisma.securityEvent
    .create({ data: { userId, type } })
    .then(() => sendPushToUser(userId, { title: 'Security alert', body: LABELS[type] || 'A security setting on your account changed.', url: '/settings/help/security', tag: `security:${type}`, type: 'security' }))
    .catch((err) => console.error('[securityEvents] could not record', type, err.message));
}
