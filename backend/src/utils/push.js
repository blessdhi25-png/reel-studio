import prisma from '../config/db.js';

// Web Push (device notifications outside the app). Needs VAPID_PUBLIC_KEY (or NEXT_PUBLIC_VAPID_PUBLIC_KEY),
// VAPID_PRIVATE_KEY and VAPID_SUBJECT (mailto: or https: URL). Generate keys once with:
//   npx web-push generate-vapid-keys
// Everything here is best-effort: a missing package, missing keys or a dead subscription never breaks the
// request that triggered the push.
// Pasted env values often carry wrapping quotes, spaces, a newline or "=" padding; web-push rejects all of those.
const cleanKey = (v) => (v || '').trim().replace(/^["']|["']$/g, '').trim().replace(/=+$/, '');
const cleanEnv = (v) => (v || '').trim().replace(/^["']|["']$/g, '').trim();
const PUBLIC_KEY = cleanKey(process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
const PRIVATE_KEY = cleanKey(process.env.VAPID_PRIVATE_KEY);
const SUBJECT = cleanEnv(process.env.VAPID_SUBJECT);

// stage tells the two failure modes apart: 'import' = package not installed on the server,
// 'vapid' = package is there but rejected the keys/subject (message is web-push's own, never the key).
export const pushLoadError = { stage: null, message: null };
let webpushPromise = null;
function loadWebPush() {
  if (!webpushPromise) {
    webpushPromise = import('web-push')
      .then((m) => {
        const wp = m.default || m;
        try {
          wp.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
        } catch (err) {
          pushLoadError.stage = 'vapid';
          pushLoadError.message = err.message;
          console.error('[push] VAPID details rejected:', err.message);
          return null;
        }
        return wp;
      })
      .catch((err) => {
        pushLoadError.stage = 'import';
        pushLoadError.message = err.message;
        console.error('[push] web-push could not be imported:', err.message);
        return null;
      });
  }
  return webpushPromise;
}

export const pushConfigured = () => !!(PUBLIC_KEY && PRIVATE_KEY && /^(mailto:|https:)/.test(SUBJECT));
export const vapidPublicKey = () => PUBLIC_KEY;

async function sendOne(wp, sub, body, errors) {
  try {
    await wp.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, { TTL: 60 * 60, urgency: 'high' });
    return true;
  } catch (err) {
    errors?.push(err.statusCode || 0);
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
 * Same as sendPushToUser but reports WHY nothing was delivered (used by "Send Test Notification"):
 * { devices, sent, errors: [httpStatus…], libMissing }.
 */
export async function sendPushDetailed(userId, payload) {
  const out = { devices: 0, sent: 0, errors: [], libMissing: false };
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  out.devices = subs.length;
  if (!subs.length) return out;
  const wp = await loadWebPush();
  if (!wp) { out.libMissing = true; return out; }
  const body = JSON.stringify({ url: '/notifications', ...payload });
  out.sent = (await Promise.all(subs.map((s) => sendOne(wp, s, body, out.errors)))).filter(Boolean).length;
  return out;
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
