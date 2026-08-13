'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { disconnectSocket, getSocket } from '../lib/socket';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const SocketContext = createContext(null);

// Event name note: `receive_message` and `notification_pushed` are what a
// from-scratch spec would call these, but the backend already emits
// `message:new` / `message:read` / `notification:new` (see
// backend/src/routes/messages.js and utils/notify.js) and BottomNav / the
// notifications page already listen for those. This context listens for
// the real names rather than events nothing on the server ever fires.
// `user_typing` and `presence_update` are genuinely new — those two match
// the requested names exactly since there's no existing convention to
// preserve (see backend/src/realtime/socket.js).

// Kept module-level (not React state) inside the provider closure via a Set
// stored in a ref — presence is a high-frequency, low-stakes update stream
// and doesn't need to be memoized/diffed like real data.

export function SocketProvider({ children }) {
  const { token, user, ready } = useAuth();
  const toast = useToast();

  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());
  const [unreadCount, setUnreadCount] = useState(0);

  // Ref-counts presence subscriptions so two components subscribed to the
  // same user id (e.g. the drawer's conversation list + an open thread)
  // don't unsubscribe each other out from under themselves.
  const presenceRefCounts = useRef(new Map());
  // Which thread (other user id), if any, is actively open/visible right
  // now — set by ChatHub/MessagesPage so this context can skip firing a
  // toast for a message the person is already looking at.
  const activeThreadIdRef = useRef(null);

  const setActiveThreadId = useCallback((id) => {
    activeThreadIdRef.current = id || null;
  }, []);

  // ---- Connection lifecycle ----
  useEffect(() => {
    if (!ready) return;

    if (!token) {
      disconnectSocket();
      setSocket(null);
      setConnected(false);
      setUnreadCount(0);
      setOnlineUserIds(new Set());
      return;
    }

    // Forces a fresh connection with the current token rather than
    // possibly reusing a stale one still authed as a previous user (see
    // disconnectSocket's comment in lib/socket.js).
    disconnectSocket();
    const s = getSocket();
    setSocket(s);
    if (!s) return;

    function onConnect() {
      setConnected(true);
      // Re-establish presence subscriptions after a reconnect — Socket.IO
      // rooms don't survive a disconnect, so anything subscribed via
      // presence:subscribe before this reconnect needs to be resent.
      const ids = [...presenceRefCounts.current.keys()];
      if (ids.length) s.emit('presence:subscribe', ids);
    }
    function onDisconnect() {
      setConnected(false);
    }

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    if (s.connected) onConnect();

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token]);

  // ---- Presence ----
  useEffect(() => {
    if (!socket) return;
    function onPresenceUpdate({ userId, online }) {
      setOnlineUserIds((prev) => {
        if (online === prev.has(userId)) return prev;
        const next = new Set(prev);
        if (online) next.add(userId);
        else next.delete(userId);
        return next;
      });
    }
    socket.on('presence_update', onPresenceUpdate);
    return () => socket.off('presence_update', onPresenceUpdate);
  }, [socket]);

  const subscribePresence = useCallback(
    (ids) => {
      const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
      if (!list.length) return;
      const toSubscribe = [];
      list.forEach((id) => {
        const count = presenceRefCounts.current.get(id) || 0;
        presenceRefCounts.current.set(id, count + 1);
        if (count === 0) toSubscribe.push(id);
      });
      if (toSubscribe.length) {
        socket?.emit('presence:subscribe', toSubscribe);
        // Seed immediately via REST rather than waiting on the next
        // connect/disconnect somewhere else to fire a presence_update —
        // otherwise a currently-online user looks offline until they
        // happen to reconnect.
        api
          .getOnlineStatus(toSubscribe)
          .then(({ onlineIds }) => {
            if (!onlineIds?.length) return;
            setOnlineUserIds((prev) => {
              const next = new Set(prev);
              onlineIds.forEach((id) => next.add(id));
              return next;
            });
          })
          .catch(() => {});
      }
    },
    [socket]
  );

  const unsubscribePresence = useCallback(
    (ids) => {
      const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
      if (!list.length) return;
      const toUnsubscribe = [];
      list.forEach((id) => {
        const count = presenceRefCounts.current.get(id) || 0;
        if (count <= 1) {
          presenceRefCounts.current.delete(id);
          toUnsubscribe.push(id);
        } else {
          presenceRefCounts.current.set(id, count - 1);
        }
      });
      if (toUnsubscribe.length) socket?.emit('presence:unsubscribe', toUnsubscribe);
    },
    [socket]
  );

  // ---- Notifications: unread badge + toast ----
  useEffect(() => {
    if (!user) return;
    api.getUnreadCount().then((d) => setUnreadCount(d.count)).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!socket) return;

    function onNotification(n) {
      setUnreadCount((c) => c + 1);
      // A DM already gets its own message toast below (and its own tab in
      // ChatHub) — the backend also fires a `type: 'message'` notification
      // for every DM (see utils/notify.js's call site in messages.js), so
      // toasting this too would double up on the same event.
      if (n.type === 'message') return;
      toast.info(n.content || 'New notification', { duration: 4000 });
    }

    function onNewMessage(msg) {
      if (msg.senderId === activeThreadIdRef.current) return; // already looking at it
      if (msg.senderId === user?.id) return; // echo of our own send, shouldn't happen but cheap to guard
      const name = msg.sender?.username ? `@${msg.sender.username}` : 'Someone';
      toast.info(`${name}: ${msg.content}`, { duration: 4000 });
    }

    function onTip({ amountCents }) {
      const amount = ((amountCents || 0) / 100).toFixed(2);
      toast.success(`You just received a $${amount} tip! 🎉`, { duration: 5000 });
    }

    socket.on('notification:new', onNotification);
    socket.on('message:new', onNewMessage);
    socket.on('tip:received', onTip);
    return () => {
      socket.off('notification:new', onNotification);
      socket.off('message:new', onNewMessage);
      socket.off('tip:received', onTip);
    };
  }, [socket, user?.id, toast]);

  const markAllNotificationsRead = useCallback(() => {
    setUnreadCount(0);
    api.markAllNotificationsRead().catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      socket,
      connected,
      onlineUsers: onlineUserIds,
      subscribePresence,
      unsubscribePresence,
      unreadCount,
      markAllNotificationsRead,
      setActiveThreadId,
    }),
    [socket, connected, onlineUserIds, subscribePresence, unsubscribePresence, unreadCount, markAllNotificationsRead, setActiveThreadId]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocketContext() {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error('useSocketContext() must be called within <SocketProvider>');
  }
  return ctx;
}
