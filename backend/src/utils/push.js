import prisma from '../config/db.js';

// Web Push (device notifications outside the app). Needs VAPID_PUBLIC_KEY (or NEXT_PUBLIC_VAPID_PUBLIC_KEY),
// VAPID_PRIVATE_KEY and VAPID_SUBJECT (mailto: or https: URL). Generate keys once with:
//   npx web-push generate-vapid-keys
// Everything here is best-effort: a missing package, missing keys or a dead subscription never breaks the
// request that triggered the push.
const PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
const PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || '').trim();
const SUBJECT = (process.env.VAPID_SUBJECT || '').trim();

let webpushPromise = null;
function loadWebPush() {
  if (!webpushPromise) {
    webpushPromise = import('web-push')
      .then((m) => {
        const wp = m.default || m;
        wp.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
        return wp;
      })
      .catch((err) => {
        console.error('[push] web-push unavailable:', err.message);
        return null;
      });
  }
  return webpushPromise;
}

export const pushConfigured = () => !!(PUBLIC_KEY && PRIVATE_KEY && /^(mailto:|https:)/.test(SUBJECT));
export const vapidPublicKey = () => PUBLIC_KEY;

async function sendOne(wp, sub, body) {
  try {
    await wp.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, { TTL: 60 * 60, urgency: 'high' });
    return true;
  } catch (err) {
    // 404/410: the browser dropped this subscription (uninstalled, permission revoked) — forget it.
    if (err.statusCode === 404 || err.statusCode === 410) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } }).catch(() => {});
    } else {
      console.error('[push] send failed:', err.statusCode || '', err.message);
    }
    return false;
  }
}

/**
 * payload: { title, body, url?, tag?, type?, icon?, requireInteraction? } — returns how many devices accepted it.
 * Never throws.
 */
export async function sendPushToUser(userId, payload) {
  try {
    if (!pushConfigured() || !userId) return 0;
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (!subs.length) return 0;
    const wp = await loadWebPush();
    if (!wp) return 0;
    const body = JSON.stringify({ url: '/notifications', ...payload });
    const results = await Promise.all(subs.map((s) => sendOne(wp, s, body)));
    return results.filter(Boolean).length;
  } catch (err) {
    console.error('[push] sendPushToUser failed:', err.message);
    return 0;
  }
}

// Notification row -> what the device shows and where tapping it goes.
export function pushForNotification(n) {
  if (!n?.userId) return;
  let url = '/notifications';
  let title = 'ClipPulse';
  if (n.type === 'message') { title = 'New message'; url = n.targetId ? `/messages/${n.targetId}` : '/messages'; }
  else if (n.type === 'live_started') { title = 'Live now'; url = n.targetId ? `/live/${n.targetId}` : '/live'; }
  else if (n.type === 'system' && n.targetType === 'support_ticket') { title = 'Support'; url = n.targetId ? `/settings/help/tickets/${n.targetId}` : '/settings/help/tickets'; }
  else if (n.type === 'system' || n.type === 'moderation') { title = 'ClipPulse alert'; }
  else if (n.type === 'follow') title = 'New follower';
  else if (n.type === 'like') title = 'New like';
  else if (n.type === 'comment') title = 'New comment';
  else if (n.type === 'tip') title = 'You got a tip';
  sendPushToUser(n.userId, { title, body: n.content, url, tag: `${n.type}:${n.targetId || n.id}`, type: n.type });
}
