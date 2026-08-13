import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';

let io;

// Real presence check — a user is "online" if they have at least one live
// socket connected right now (everyone auto-joins `user:${id}` on connect,
// see below). No polling/heartbeat table; this is computed live off the
// actual connections Socket.IO is already tracking.
export function getOnlineUserIds(ids) {
  if (!io) return [];
  return ids.filter((id) => (io.sockets.adapter.rooms.get(`user:${id}`)?.size || 0) > 0);
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

    socket.on('live:join', (streamId) => {
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
        }))
      );

      socket.to(room).emit('live:peer-joined', {
        socketId: socket.id,
        username: socket.data.username,
      });

      io.to(room).emit('live:viewer-count', { count: io.sockets.adapter.rooms.get(room)?.size || 0 });
    });

    socket.on('live:signal', ({ to, signal }) => {
      io.to(to).emit('live:signal', { from: socket.id, signal });
    });

    socket.on('live:chat-message', ({ streamId, content }) => {
      if (!content || !content.trim()) return;
      io.to(`live:${streamId}`).emit('live:chat-message', {
        username: socket.data.username,
        content: content.trim(),
        at: new Date().toISOString(),
      });
    });

    socket.on('live:leave', () => leaveLiveRoom(socket));
    socket.on('disconnect', () => leaveLiveRoom(socket));

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

// Generic per-user event push — used e.g. by the Stripe webhook to fire
// 'tip:received' the instant a tip is confirmed, so the recipient sees a
// celebration banner in real time rather than waiting to notice the bell.
export function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}
