import { io } from 'socket.io-client';
import { API_BASE } from './api';

// Strip the /api/v1 suffix to get the bare origin socket.io needs to
// connect to (e.g. https://reel-backend-a2sz.onrender.com). Derived from
// the same API_BASE the rest of the app uses, instead of re-reading
// NEXT_PUBLIC_API_BASE directly, so this can't drift out of sync with the
// resolved value (env var vs LAN/ngrok fallback) that api.js computes.
const SOCKET_URL = API_BASE.replace(/\/api\/v1$/, '');

let socket;

export function getSocket() {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('token');
  if (!token) return null;

  if (!socket || socket.disconnected) {
    socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
  }
  return socket;
}

// Socket.io's `auth` option is only read once, at connection time — if the
// signed-in user changes (login as someone else, logout) without a full
// page reload, a live socket would otherwise keep using the *old* token
// forever. SocketContext calls this whenever AuthContext's token changes,
// so the next getSocket() call is guaranteed to open a fresh connection
// authenticated as whoever is actually signed in now.
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
