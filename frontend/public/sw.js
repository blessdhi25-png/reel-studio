/* ClipPulse service worker — Web Push only (no offline caching, so it can never serve stale pages).
   Registered from lib/push.js when someone turns on "Device / Push notifications". */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'ClipPulse';

  event.waitUntil(
    (async () => {
      // If the app is open and in front of the person, the in-app UI already shows it — don't double up.
      // The explicit "Send Test Notification" always shows, so the system tray can be verified.
      if (data.type !== 'test') {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (windows.some((c) => c.visibilityState === 'visible')) return;
      }
      await self.registration.showNotification(title, {
        body: data.body || '',
        icon: data.icon || '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: data.tag || undefined, // same tag replaces the earlier notification instead of stacking
        renotify: !!data.tag,
        requireInteraction: !!data.requireInteraction,
        data: { url: data.url || '/notifications' },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only same-origin paths; anything else falls back to the notifications screen.
  let target = event.notification.data?.url || '/notifications';
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//')) target = '/notifications';
  const url = new URL(target, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
