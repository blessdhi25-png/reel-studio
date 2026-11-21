import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { sendPushToUser } from '../utils/push.js';
import prisma from '../config/db.js';
import { canMessage } from '../utils/messagingAccess.js';

let io;

// Real presence check — a user is "online" if they have at least one live
// socket connected right now (everyone auto-joins `user:${id}` on connect,
// see below). No polling/heartbeat table; this is computed live off the
// actual connections Socket.IO is already tracking.
export function getOnlineUserIds(ids) {
  if (!io) return [];
  return ids.filter((id) => (io.sockets.adapter.rooms.get(`user:${id}`)?.size || 0) > 0);
}

// ---- 1:1 voice/video call signaling (WebRTC) ----
// The server only relays SDP/ICE between the two users; media flows peer-to-peer.
// userId -> { callId, peerId, at }: a user in (or ringing for) a call is "busy" to new callers.
const activeCalls = new Map();
const CALL_STALE_MS = 3 * 60 * 60 * 1000;
const MAX_SDP_CHARS = 20000;
const LIVE_REACTION_EMOJIS = ['❤️', '🔥', '👏', '🚀', '😂', '🎉', '😮'];

function getBusyCall(userId) {
  const c = activeCalls.get(userId);
  if (!c) return null;
  if (Date.now() - c.at > CALL_STALE_MS) {
    activeCalls.delete(userId);
    return null;
  }
  return c;
}

function clearCall(callId) {
  for (const [uid, c] of activeCalls) if (c.callId === callId) activeCalls.delete(uid);
}

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3000' },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('unauthorized'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, username: true, accountStatus: true },
      });
      if (!user || user.accountStatus !== 'active') return next(new Error('unauthorized'));
      socket.data.userId = user.id;
      socket.data.username = user.username;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    // Personal room for pushing notifications to this user across all their tabs/devices.
    socket.join(`user:${socket.data.userId}`);

    // Tell anyone already subscribed to this user's presence (see
    // presence:subscribe below) that they just came online. Fires on every
    // new tab/device connecting, not just the first — harmless, since
    // clients just treat repeat "online: true" as a no-op.
    io.to(`presence:${socket.data.userId}`).emit('presence_update', {
      userId: socket.data.userId,
      online: true,
    });

    // ---- Presence subscriptions ----
    // Presence isn't broadcast globally (that would leak every user's
    // online status to every connected client, and doesn't scale) — instead
    // a client explicitly declares which user ids it currently cares about
    // (e.g. open conversation threads) and only gets updates for those.
    // Capped generously above realistic usage (a conversation list) as a
    // cheap guard against a misbehaving client subscribing to everyone.
    socket.on('presence:subscribe', (userIds) => {
      if (!Array.isArray(userIds)) return;
      userIds.slice(0, 300).forEach((id) => {
        if (typeof id === 'string') socket.join(`presence:${id}`);
      });
    });

    socket.on('presence:unsubscribe', (userIds) => {
      if (!Array.isArray(userIds)) return;
      userIds.forEach((id) => {
        if (typeof id === 'string') socket.leave(`presence:${id}`);
      });
    });

    // ---- DM typing indicator ----
    // Plain relay through the recipient's personal room — no persistence,
    // no room bookkeeping, just "tell the other side right now".
    socket.on('typing:start', ({ toUserId } = {}) => {
      if (typeof toUserId !== 'string') return;
      io.to(`user:${toUserId}`).emit('user_typing', { userId: socket.data.userId, typing: true });
    });
    socket.on('typing:stop', ({ toUserId } = {}) => {
      if (typeof toUserId !== 'string') return;
      io.to(`user:${toUserId}`).emit('user_typing', { userId: socket.data.userId, typing: false });
    });

    // ---- Live stream: join/leave, WebRTC signaling, chat ----

    socket.on('live:join', (streamId, ack) => {
      const room = `live:${streamId}`;
      const existingPeers = [...(io.sockets.adapter.rooms.get(room) || [])];

      socket.join(room);
      socket.data.currentLiveRoom = room;

      // Tell the newcomer who's already here so they can initiate WebRTC offers.
      socket.emit(
        'live:existing-peers',
        existingPeers.map((socketId) => ({
          socketId,
          username: io.sockets.sockets.get(socketId)?.data.username,
          userId: io.sockets.sockets.get(socketId)?.data.userId, // lets clients tell which peer is the host
          sharing: !!io.sockets.sockets.get(socketId)?.data.sharing,
        }))
      );

      socket.to(room).emit('live:peer-joined', {
        socketId: socket.id,
        username: socket.data.username,
        userId: socket.data.userId,
      });

      const count = io.sockets.adapter.rooms.get(room)?.size || 0;
      io.to(room).emit('live:viewer-count', { count });

      // Optional ack so the client can tell the room join actually completed.
      if (typeof ack === 'function') ack({ ok: true, count });
    });

    socket.on('live:signal', ({ to, signal }) => {
      io.to(to).emit('live:signal', { from: socket.id, signal });
    });

    socket.on('live:chat-message', ({ streamId, content }) => {
      if (!content || !content.trim()) return;
      io.to(`live:${streamId}`).emit('live:chat-message', {
        userId: socket.data.userId,
        username: socket.data.username,
        content: content.trim().slice(0, 500),
        at: new Date().toISOString(),
      });
    });

    // Ephemeral — not persisted. Any client can request a pin/unpin; the
    // frontend only exposes the control to the host, same trust model as
    // the rest of this signaling namespace (auth'd socket, no extra ACL).
    socket.on('live:pin-message', ({ streamId, message }) => {
      io.to(`live:${streamId}`).emit('live:pin-message', message || null);
    });

    // Lightweight floating emoji burst — not stored, just relayed for the
    // animation. Distinct from live:chat-message so it doesn't clutter the
    // scrollback.
    socket.on('live:reaction', ({ streamId, emoji } = {}) => {
      if (typeof streamId !== 'string' || !LIVE_REACTION_EMOJIS.includes(emoji)) return;
      // Only people actually in the room can broadcast to it.
      if (!socket.rooms.has(`live:${streamId}`)) return;
      // Cheap flood guard: at most ~8 reactions/second per socket.
      const now = Date.now();
      const recent = (socket.data.reactionTimes || []).filter((t) => now - t < 1000);
      if (recent.length >= 8) return;
      recent.push(now);
      socket.data.reactionTimes = recent;
      io.to(`live:${streamId}`).emit('live:reaction', {
        emoji,
        username: socket.data.username,
        at: now,
      });
    });

    // Tells the room a participant is (no longer) sharing their screen, so tiles letterbox it.
    socket.on('live:screen-share', ({ streamId, active } = {}) => {
      if (typeof streamId !== 'string' || !socket.rooms.has(`live:${streamId}`)) return;
      socket.data.sharing = !!active;
      socket.to(`live:${streamId}`).emit('live:screen-share', { socketId: socket.id, active: !!active });
    });

    socket.on('live:leave', () => leaveLiveRoom(socket));
    // Connection-health relay: a participant's client reports 'lost' / 'unstable' / 'ok' (ICE failed,
    // browser offline…) and everyone else in the room is told, so tiles/banners can say who dropped.
    socket.on('live:connection-status', ({ streamId, state } = {}) => {
      if (typeof streamId !== 'string' || !socket.rooms.has(`live:${streamId}`)) return;
      if (!['ok', 'unstable', 'lost'].includes(state)) return;
      socket.to(`live:${streamId}`).emit('live:connection-status', {
        socketId: socket.id,
        userId: socket.data.userId,
        username: socket.data.username,
        state,
      });
    });

    socket.on('disconnect', (reason) => {
      // A deliberate leave/close is not an outage; anything else (ping timeout when mobile data is
      // switched off, transport error…) is. Tell the room *before* the peer-left so the alert can name them.
      const room = socket.data.currentLiveRoom;
      if (room && reason !== 'client namespace disconnect' && reason !== 'server namespace disconnect') {
        socket.to(room).emit('live:connection-status', {
          socketId: socket.id,
          userId: socket.data.userId,
          username: socket.data.username,
          state: 'lost',
        });
      }
      leaveLiveRoom(socket);
    });

    // ---- Calls ----
    function validCallId(id) {
      return typeof id === 'string' && id.length > 0 && id.length <= 64;
    }

    socket.on('call:offer', async ({ toUserId, callId, callType, sdp } = {}) => {
      const me = socket.data.userId;
      if (typeof toUserId !== 'string' || !validCallId(callId)) return;
      if (callType !== 'voice' && callType !== 'video') return;
      if (!sdp || typeof sdp.sdp !== 'string' || sdp.sdp.length > MAX_SDP_CHARS) return;
      if (toUserId === me) return;

      const fail = (event, extra = {}) => socket.emit(event, { callId, ...extra });

      if (!(await canMessage(me, toUserId))) return fail('call:unavailable', { reason: 'not-allowed' });
      const calleeOnline = (io.sockets.adapter.rooms.get(`user:${toUserId}`)?.size || 0) > 0;
      // Device notification for the callee. The service worker skips it while the app is open and visible.
      prisma.user.findUnique({ where: { id: me }, select: { username: true } }).then((u) => sendPushToUser(toUserId, {
        title: calleeOnline ? `Incoming ${callType} call` : 'Missed call',
        body: calleeOnline ? `@${u?.username || 'Someone'} is calling you` : `@${u?.username || 'Someone'} tried to call you`,
        url: `/messages/${me}`,
        tag: `call:${callId}`,
        type: 'call',
        requireInteraction: calleeOnline,
      })).catch(() => {});
      if (!calleeOnline) return fail('call:unavailable', { reason: 'offline' });
      if (getBusyCall(toUserId) || getBusyCall(me)) return fail('call:busy');

      const now = Date.now();
      activeCalls.set(me, { callId, peerId: toUserId, at: now });
      activeCalls.set(toUserId, { callId, peerId: me, at: now });
      socket.data.activeCallId = callId;

      const caller = await prisma.user.findUnique({
        where: { id: me },
        select: { id: true, username: true, avatarUrl: true },
      });
      io.to(`user:${toUserId}`).emit('call:offer', { callId, callType, sdp, from: caller });
    });

    socket.on('call:answer', ({ toUserId, callId, sdp } = {}) => {
      const me = socket.data.userId;
      const c = getBusyCall(me);
      if (!c || c.callId !== callId || c.peerId !== toUserId) return;
      if (!sdp || typeof sdp.sdp !== 'string' || sdp.sdp.length > MAX_SDP_CHARS) return;
      socket.data.activeCallId = callId;
      // Other tabs/devices of the callee stop ringing.
      socket.to(`user:${me}`).emit('call:handled', { callId });
      io.to(`user:${toUserId}`).emit('call:answer', { callId, sdp });
    });

    socket.on('call:ice', ({ toUserId, callId, candidate } = {}) => {
      const c = getBusyCall(socket.data.userId);
      if (!c || c.callId !== callId || c.peerId !== toUserId || !candidate) return;
      io.to(`user:${toUserId}`).emit('call:ice', { callId, candidate });
    });

    // decline (callee) and end (either side, incl. caller cancelling while ringing) share cleanup.
    function endCall(event) {
      return ({ toUserId, callId } = {}) => {
        const me = socket.data.userId;
        const c = getBusyCall(me);
        if (!c || c.callId !== callId || c.peerId !== toUserId) return;
        clearCall(callId);
        socket.data.activeCallId = null;
        io.to(`user:${toUserId}`).emit(event, { callId });
        if (event === 'call:decline') socket.to(`user:${me}`).emit('call:handled', { callId });
      };
    }
    socket.on('call:decline', endCall('call:decline'));
    socket.on('call:end', endCall('call:end'));

    socket.on('disconnect', () => {
      const callId = socket.data.activeCallId;
      if (!callId) return;
      const me = socket.data.userId;
      const c = getBusyCall(me);
      if (c && c.callId === callId) {
        clearCall(callId);
        io.to(`user:${c.peerId}`).emit('call:end', { callId });
      }
    });


    // "disconnecting" (not "disconnect") fires while the socket's rooms are
    // still populated, so this is the last point `user:${id}`'s room size
    // reflects this socket. Deferred to the next tick so it actually runs
    // after socket.io finishes removing this socket from that room —
    // otherwise a still-connected second tab/device would look offline for
    // an instant, or worse, this socket would count itself.
    socket.on('disconnecting', () => {
      const userId = socket.data.userId;
      setImmediate(() => {
        const stillOnline = (io.sockets.adapter.rooms.get(`user:${userId}`)?.size || 0) > 0;
        if (!stillOnline) {
          io.to(`presence:${userId}`).emit('presence_update', { userId, online: false });
        }
      });
    });
  });

  return io;
}

function leaveLiveRoom(socket) {
  socket.data.sharing = false;
  const room = socket.data.currentLiveRoom;
  if (!room) return;
  socket.to(room).emit('live:peer-left', { socketId: socket.id });
  socket.leave(room);
  socket.data.currentLiveRoom = null;
  const count = io.sockets.adapter.rooms.get(room)?.size || 0;
  io.to(room).emit('live:viewer-count', { count });
}

// Used by utils/notify.js to push a freshly created notification in real time.
export function pushNotification(userId, notification) {
  io?.to(`user:${userId}`).emit('notification:new', notification);
}

// Used by routes/webhook.js to drop a paid live tip straight into the room's
// chat ticker the moment Stripe confirms payment, without waiting on the
// notification bell.
export function emitToRoom(room, event, payload) {
  io?.to(room).emit(event, payload);
}

// Generic per-user event push — used e.g. by the Stripe webhook to fire
// 'tip:received' the instant a tip is confirmed, so the recipient sees a
// celebration banner in real time rather than waiting to notice the bell.
export function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

// Host ended the stream: tell everyone in the room, then drop them from it so no late
// signalling/chat/reactions reach (or come from) a finished stream.
export function closeLiveRoom(streamId) {
  if (!io) return;
  const room = `live:${streamId}`;
  io.to(room).emit('live:stream-ended', { id: streamId });
  io.in(room).socketsLeave(room);
}
