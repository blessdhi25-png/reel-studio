'use client';

import { api } from './api';

// Device (Web Push) notifications: service worker registration, permission, subscription, server sync.
// Everything that needs a user gesture (the permission prompt) lives in enablePush(); call it from a click.

export const SW_URL = '/sw.js';

export function pushSupport() {
  if (typeof window === 'undefined') return { ok: false, reason: 'server' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    // iOS only exposes Web Push to a site that has been added to the Home Screen.
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return { ok: false, reason: ios ? 'ios-install' : 'unsupported' };
  }
  return { ok: true };
}

function urlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// The SERVER's key wins: it's the one its private key signs with, so a stale or different
// NEXT_PUBLIC_VAPID_PUBLIC_KEY on the frontend can't produce subscriptions the server is unable to use.
async function getPublicKey() {
  try {
    const cfg = await api.getPushConfig();
    if (cfg?.enabled && cfg.publicKey) return cfg.publicKey;
  } catch {}
  return (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim() || null;
}

const sameKey = (buf, key) => {
  if (!buf) return false;
  const a = new Uint8Array(buf);
  const b = urlBase64ToUint8Array(key);
  return a.length === b.length && a.every((v, i) => v === b[i]);
};

async function getRegistration() {
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  return existing || navigator.serviceWorker.register(SW_URL, { scope: '/' });
}

/** { supported, reason?, permission: 'granted'|'denied'|'default', subscribed } — safe to call any time. */
export async function getPushState() {
  const support = pushSupport();
  if (!support.ok) return { supported: false, reason: support.reason, permission: 'default', subscribed: false };
  const permission = Notification.permission;
  let subscribed = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    subscribed = !!(await reg?.pushManager.getSubscription());
  } catch {}
  return { supported: true, permission, subscribed: subscribed && permission === 'granted' };
}

/** Asks for permission (must run inside a click), subscribes this device and saves it on the server. */
export async function enablePush() {
  const support = pushSupport();
  if (!support.ok) throw Object.assign(new Error('This browser can’t receive push notifications.'), { code: support.reason });

  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw Object.assign(new Error('Notifications are blocked for this site.'), { code: permission === 'denied' ? 'blocked' : 'dismissed' });

  const key = await getPublicKey();
  if (!key) throw Object.assign(new Error('Push notifications aren’t set up on this server yet.'), { code: 'not-configured' });

  const reg = await getRegistration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with a different VAPID key is useless (the push service rejects the server's sends): replace it.
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  await api.pushSubscribe({ subscription: sub.toJSON(), userAgent: navigator.userAgent });
  return true;
}

/**
 * The browser can hold a subscription the server never stored (earlier save failed, migration wasn't applied,
 * database reset). If this device is subscribed locally but the server knows no devices, save it again.
 */
export async function resyncPushIfNeeded() {
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    const sub = await reg?.pushManager.getSubscription();
    if (!sub || Notification.permission !== 'granted') return;
    const key = await getPublicKey();
    if (key && !sameKey(sub.options?.applicationServerKey, key)) return enablePush(); // wrong key: rebuild it
    const { devices } = await api.getPushStatus();
    if (!devices) await api.pushSubscribe({ subscription: sub.toJSON(), userAgent: navigator.userAgent });
  } catch {}
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.pushUnsubscribe(sub.endpoint).catch(() => {}); // still drop the browser side if the server is unreachable
    await sub.unsubscribe();
  }
  return true;
}

export const sendTestPush = () => api.pushTest();
