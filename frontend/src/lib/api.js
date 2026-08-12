// --------------------------------------------------------------------------
// API base URL resolution
// --------------------------------------------------------------------------
// Why this needs to be more than `process.env.NEXT_PUBLIC_API_URL || fallback`:
// on a phone (e.g. testing through ngrok), "localhost" in a hardcoded
// fallback resolves to the *phone itself*, not the dev machine — so if the
// env var is ever unset or still pointing at localhost, every request
// throws a bare "Failed to fetch" with no indication why. This resolves,
// in order:
//   1. NEXT_PUBLIC_API_URL (preferred) or NEXT_PUBLIC_API_BASE (legacy name
//      this project used previously — kept for compatibility), as long as
//      it isn't still set to a localhost/127.0.0.1 URL.
//   2. If running in the browser on a non-localhost hostname (e.g. a LAN IP
//      like 192.168.x.x, which is the common way to open the app on a
//      phone without ngrok), same-origin with the backend's port swapped
//      in — so http://192.168.1.20:3000 resolves to
//      http://192.168.1.20:4000/api/v1 automatically.
//   3. Localhost, for normal desktop dev.
//
// Note for ngrok specifically: ngrok gives the frontend and backend
// *different* hostnames (two separate tunnels), so step 2's same-origin
// port-swap can't work there — set NEXT_PUBLIC_API_URL in
// frontend/.env.local to the backend's ngrok URL (e.g.
// https://abcd1234.ngrok-free.app/api/v1) and restart `npm run dev`.
function resolveApiBase() {
  const envUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE;
  const envIsUsable = envUrl && !/localhost|127\.0\.0\.1/.test(envUrl);
  if (envIsUsable) return envUrl;

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      const backendPort = process.env.NEXT_PUBLIC_API_PORT || '4000';
      return `${protocol}//${hostname}:${backendPort}/api/v1`;
    }
  }

  return envUrl || 'http://localhost:4000/api/v1';
}

export const API_BASE = resolveApiBase();

function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('token');
}

// Reads the cached user object from localStorage, the same way
// context/AuthContext.jsx does internally. Exported separately for the few
// places (e.g. app/profile/[id]/page.jsx) that need a quick one-off read
// — a self/id comparison inside a mount-only effect — without pulling in
// the full reactive useAuth() context. Guards against both SSR (no
// `window`) and a malformed/corrupted localStorage value so a bad cache
// entry degrades to "logged out" instead of throwing.
export function getStoredUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function request(path, { method = 'GET', body, isForm = false, timeoutMs = 15000 } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm && body) headers['Content-Type'] = 'application/json';

  const url = `${API_BASE}${path}`;

  // Defense-in-depth against the UI hanging forever on a stuck request
  // (e.g. profile fetches getting stuck on an infinite skeleton loader): a
  // request that neither succeeds nor fails within timeoutMs is aborted so
  // the caller's try/catch/finally always runs. The real fix for the
  // profile page's hang was on the backend (see
  // backend/src/utils/asyncHandler.js — a thrown error in an async Express
  // 4 route was never sending a response at all), but this guards against
  // any other future case where a connection genuinely never resolves.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (networkErr) {
    // fetch() throws a bare TypeError ("Failed to fetch") for anything from
    // a wrong host/port to no network at all, and an AbortError when our
    // own timeout above fires — neither is self-explanatory to someone
    // testing on a phone. Log the exact URL so it's obvious at a glance
    // whether the base URL resolved correctly, and surface a message
    // people can actually act on.
    console.error(`[api] ${networkErr.name === 'AbortError' ? 'Timed out requesting' : 'Network error requesting'} ${url}:`, networkErr);
    const err = new Error(
      networkErr.name === 'AbortError'
        ? 'The server took too long to respond. This can happen if it\u2019s waking up after being idle \u2014 please try again in a moment.'
        : 'Unable to connect to the server. Please verify backend connection.'
    );
    err.cause = networkErr;
    err.requestUrl = url;
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const err = new Error(body.error || 'Request failed');
    Object.assign(err, body);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Full-page redirect target for "Continue with Google" — the backend
// handles the OAuth handshake and sends the browser back to
// /auth/callback with a token once it's done.
export function googleAuthUrl() {
  return `${API_BASE}/auth/google`;
}

// Render's free tier spins the backend down after ~15 minutes of
// inactivity; the next request has to wait for a cold start, which can
// easily take 30-50+ seconds — well past the default 15s request timeout,
// which is exactly what produced "The server took too long to respond" on
// login/register/Google sign-in screenshotted from production. Two things
// address this together: auth calls below use a longer AUTH_TIMEOUT_MS, and
// pingServer() lets a page fire a cheap, fire-and-forget /health request as
// soon as it mounts (e.g. the login/signup page's first render) so the cold
// start happens in the background *before* the person finishes typing their
// password, rather than during the login submit itself.
const AUTH_TIMEOUT_MS = 45000;

export function pingServer() {
  request('/health', { timeoutMs: 8000 }).catch(() => {
    // Swallowed on purpose — this is best-effort warming, not a real
    // request the UI depends on. If the server is asleep this may itself
    // time out without ever waking it (Render's cold start can outlast
    // even this timeout on a slow spin-up); the real login/register/Google
    // request afterward still gets its own full AUTH_TIMEOUT_MS.
  });
}

export const api = {
  register: (data) => request('/auth/register', { method: 'POST', body: data, timeoutMs: AUTH_TIMEOUT_MS }),
  getMe: () => request('/auth/me'),
  // For Google Identity Services / One-Tap: pass the credential GSI hands
  // back after sign-in, get { token, user } directly (no redirect).
  googleOneTapLogin: (credential) =>
    request('/auth/google', { method: 'POST', body: { credential }, timeoutMs: AUTH_TIMEOUT_MS }),
  login: (data) => request('/auth/login', { method: 'POST', body: data, timeoutMs: AUTH_TIMEOUT_MS }),
  verifyEmail: (email, code) =>
    request('/auth/verify-email', { method: 'POST', body: { email, code }, timeoutMs: AUTH_TIMEOUT_MS }),
  resendVerification: (email) =>
    request('/auth/resend-verification', { method: 'POST', body: { email }, timeoutMs: AUTH_TIMEOUT_MS }),
  forgotPassword: (email) =>
    request('/auth/forgot-password', { method: 'POST', body: { email }, timeoutMs: AUTH_TIMEOUT_MS }),
  resetPassword: (token, newPassword) =>
    request('/auth/reset-password', { method: 'POST', body: { token, newPassword }, timeoutMs: AUTH_TIMEOUT_MS }),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword }, timeoutMs: AUTH_TIMEOUT_MS }),
  getFeed: (type, cursor, weights, circle, following) => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (cursor) params.set('cursor', cursor);
    if (circle) params.set('circle', circle);
    if (following) params.set('following', 'true');
    if (weights?.nicheWeight !== undefined) params.set('nicheWeight', weights.nicheWeight);
    if (weights?.freshWeight !== undefined) params.set('freshWeight', weights.freshWeight);
    if (weights?.localWeight !== undefined) params.set('localWeight', weights.localWeight); // accepted, currently unused server-side
    return request(`/videos/feed?${params.toString()}`);
  },
  getSuggestedUsers: (limit) => request(`/users/suggested${limit ? `?limit=${limit}` : ''}`),
  getOnlineStatus: (ids) => request(`/users/online?ids=${ids.join(',')}`),
  getCircles: () => request('/videos/circles'),
  likeVideo: (id) => request(`/videos/${id}/like`, { method: 'POST' }),
  unlikeVideo: (id) => request(`/videos/${id}/like`, { method: 'DELETE' }),
  deleteVideo: (id) => request(`/videos/${id}`, { method: 'DELETE' }),
  bookmarkVideo: (id) => request(`/videos/${id}/bookmark`, { method: 'POST' }),
  unbookmarkVideo: (id) => request(`/videos/${id}/bookmark`, { method: 'DELETE' }),
  getBookmarks: () => request('/users/me/bookmarks'),
  getLikedVideos: () => request('/users/me/likes'),
  getComments: (id) => request(`/videos/${id}/comments`),
  postComment: (id, content) =>
    request(`/videos/${id}/comments`, { method: 'POST', body: { content } }),
  tipVideoCheckout: (id, amountCents) =>
    request(`/videos/${id}/tip/checkout`, { method: 'POST', body: { amountCents } }),
  connectStripe: () => request('/stripe/connect', { method: 'POST' }),
  getStripeStatus: () => request('/stripe/status'),
  getStripeDashboardLink: () => request('/stripe/dashboard-link', { method: 'POST' }),
  uploadVideo: (formData) => request('/videos', { method: 'POST', body: formData, isForm: true }),
  logView: (id) => request(`/videos/${id}/view`, { method: 'POST' }),
  logEvent: (id, eventType, watchDurationMs) =>
    request(`/videos/${id}/events`, { method: 'POST', body: { eventType, watchDurationMs } }),
  getUser: (id) => request(`/users/${id}`),
  updateProfile: (data) => request('/users/me', { method: 'PATCH', body: data }),
  uploadAvatar: (formData) => request('/users/me/avatar', { method: 'POST', body: formData, isForm: true }),
  uploadBanner: (formData) => request('/users/me/banner', { method: 'POST', body: formData, isForm: true }),

  // Artist Hub
  getMyArtistProfile: () => request('/artists/me'),
  registerArtist: (data) => request('/artists/register', { method: 'POST', body: data }),
  getMyTracks: () => request('/artists/me/tracks'),
  uploadTrack: (formData) => request('/artists/me/tracks', { method: 'POST', body: formData, isForm: true }),
  searchTracks: (q) => request(`/artists/tracks/search${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getTrendingSounds: ({ query, limit } = {}) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (limit) params.set('limit', limit);
    const qs = params.toString();
    return request(`/artists/tracks/trending${qs ? `?${qs}` : ''}`);
  },
  getTrackVideos: (trackId) => request(`/artists/tracks/${trackId}/videos`),
  getTrack: (trackId) => request(`/artists/tracks/${trackId}`),
  getUserVideos: (id) => request(`/users/${id}/videos`),
  followUser: (id) => request(`/users/${id}/follow`, { method: 'POST' }),
  unfollowUser: (id) => request(`/users/${id}/follow`, { method: 'DELETE' }),
  getFollowing: (id) => request(`/users/${id}/following`),
  getFollowers: (id) => request(`/users/${id}/followers`),
  getEarnings: () => request('/users/me/earnings'),
  getConversations: () => request('/conversations'),
  getThread: (otherUserId) => request(`/conversations/${otherUserId}`),
  sendMessage: (otherUserId, content) =>
    request(`/conversations/${otherUserId}`, { method: 'POST', body: { content } }),
  fileReport: (targetType, targetId, reason, details) =>
    request('/reports', { method: 'POST', body: { targetType, targetId, reason, details } }),

  // Privacy & blocking
  getPrivacySettings: () => request('/users/me/privacy'),
  updatePrivacySettings: (data) => request('/users/me/privacy', { method: 'PATCH', body: data }),
  getBlockedUsers: () => request('/users/me/blocked'),
  blockUser: (id) => request(`/users/${id}/block`, { method: 'POST' }),
  unblockUser: (id) => request(`/users/${id}/block`, { method: 'DELETE' }),

  // Admin
  adminMe: () => request('/admin/me'),
  // Add this inside your api object in frontend/src/lib/api.js
adminGetStats: () => request('/admin/stats'),
  adminGetStatus: () => request('/admin/status'),
  adminGetReports: (status = 'pending', search = '') =>
    request(`/admin/reports?status=${status}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  adminGetReportStats: () => request('/admin/reports/stats'),
  adminResolveReport: (id, action, note) =>
    request(`/admin/reports/${id}/resolve`, { method: 'POST', body: { action, note } }),
  adminGetUsers: (params = {}) =>
    request(`/admin/users?${new URLSearchParams(params).toString()}`),
  adminSuspendUser: (id, reason) =>
    request(`/admin/users/${id}/suspend`, { method: 'POST', body: { reason } }),
  adminBanUser: (id, reason) =>
    request(`/admin/users/${id}/ban`, { method: 'POST', body: { reason } }),
  adminReinstateUser: (id) => request(`/admin/users/${id}/reinstate`, { method: 'POST' }),
  adminSetUserStatus: (id, status, reason) =>
    request(`/admin/users/${id}/status`, { method: 'PATCH', body: { status, reason } }),
  adminChangeRole: (id, role) =>
    request(`/admin/users/${id}/role`, { method: 'POST', body: { role } }),
  adminGetVideos: (status = 'published') => request(`/admin/videos?status=${status}`),
  adminRemoveVideo: (id, reason) =>
    request(`/admin/videos/${id}/remove`, { method: 'POST', body: { reason } }),
  adminGetVideoFlags: (id) => request(`/admin/videos/${id}/flags`),
  adminGetFraudSignals: () => request('/admin/fraud-signals'),
  adminGetAuditLog: (page = 1, limit = 50) =>
    request(`/admin/audit-log?page=${page}&limit=${limit}`),

  // Notifications
  getNotifications: () => request('/notifications'),
  getUnreadCount: () => request('/notifications/unread-count'),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'POST' }),

  // Live streaming
  getLiveStreams: (category) => request(`/live${category && category !== 'All' ? `?category=${category}` : ''}`),
  getLiveStream: (id) => request(`/live/${id}`),
  startLiveStream: (title, extra = {}) => request('/live/start', { method: 'POST', body: { title, ...extra } }),
  endLiveStream: (id) => request(`/live/${id}/end`, { method: 'POST' }),

  // Discovery
  search: (q) => request(`/search?q=${encodeURIComponent(q)}`),
  getTrending: () => request('/trending'),

  // Studio (analytics) & Promote (boost)
  getStudioOverview: () => request('/studio/overview'),
  getBoostTiers: () => request('/boost/tiers'),
  boostVideoCheckout: (id, tier) =>
    request(`/videos/${id}/boost/checkout`, { method: 'POST', body: { tier } }),
};
