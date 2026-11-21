import { Router } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Facebook account linking + friend discovery (Settings → Contacts and location).
//   /api/v1/auth/facebook/*     start (auth), callback (browser redirect from Facebook), status, unlink
//   /api/v1/friends/facebook*   matched friends list, re-sync
//
// Facebook's Graph API only returns friends who ALSO authorised this app with the user_friends permission, so
// "Facebook friends on ClipPulse" is exactly that set. We store no Facebook access token: linking records the
// app-scoped id + name, and the friend ids returned at that moment; re-syncing simply repeats the (silent,
// already-authorised) login. user_friends needs Facebook app review for people outside the app's roles.
export const authRouter = Router();
export const friendsRouter = Router();

const clean = (v) => (v || '').trim().replace(/^["']|["']$/g, '').trim();
const APP_ID = clean(process.env.FACEBOOK_APP_ID);
const APP_SECRET = clean(process.env.FACEBOOK_APP_SECRET);
const REDIRECT_URI =
  clean(process.env.FACEBOOK_REDIRECT_URI) ||
  `${clean(process.env.BASE_URL).replace(/\/+$/, '') || 'http://localhost:4000'}/api/v1/auth/facebook/callback`;
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
const GRAPH = 'https://graph.facebook.com/v19.0';
const RETURN_PATH = '/settings/contacts-location';
const MAX_FRIENDS = 5000;
const configured = () => !!(APP_ID && APP_SECRET);

const back = (res, code) => res.redirect(`${FRONTEND_URL}${RETURN_PATH}?facebook=${encodeURIComponent(code)}`);

function signState(userId) {
  return jwt.sign({ purpose: 'facebook_link', sub: userId }, process.env.JWT_SECRET, { expiresIn: '10m' });
}
function readState(state) {
  try {
    const p = jwt.verify(state, process.env.JWT_SECRET);
    return p.purpose === 'facebook_link' ? p : null;
  } catch {
    return null;
  }
}

function authUrl(userId) {
  const params = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: REDIRECT_URI,
    state: signState(userId),
    response_type: 'code',
    scope: 'public_profile,user_friends',
  });
  return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
}

async function graph(path, params) {
  const r = await fetch(`${GRAPH}${path}?${new URLSearchParams(params).toString()}`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) {
    const e = new Error(data.error?.message || `Graph ${r.status}`);
    e.fb = data.error;
    throw e;
  }
  return data;
}

async function fetchFriendIds(accessToken) {
  const ids = [];
  let next = `${GRAPH}/me/friends?${new URLSearchParams({ fields: 'id', limit: '500', access_token: accessToken })}`;
  for (let page = 0; next && page < 12 && ids.length < MAX_FRIENDS; page += 1) {
    const r = await fetch(next);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) throw new Error(data.error?.message || `Graph friends ${r.status}`);
    (data.data || []).forEach((f) => f?.id && ids.push(String(f.id)));
    next = data.paging?.next || null;
  }
  return [...new Set(ids)].slice(0, MAX_FRIENDS);
}

// POST /auth/facebook/start  → { url }  (the browser then navigates to Facebook's consent dialog)
authRouter.post('/start', requireAuth, (req, res) => {
  if (!configured()) return res.status(503).json({ error: 'Facebook linking isn’t set up on this server yet.', code: 'facebook_not_configured' });
  res.json({ url: authUrl(req.userId) });
});

// GET /auth/facebook/callback?code&state  — Facebook redirects the browser here.
authRouter.get('/callback', asyncHandler(async (req, res) => {
  const { code, state, error: fbError } = req.query;
  if (fbError) return back(res, 'denied');
  if (!configured()) return back(res, 'not_configured');
  const st = state ? readState(state) : null;
  if (!st || !code) return back(res, 'state_invalid');

  try {
    const tokenData = await graph('/oauth/access_token', { client_id: APP_ID, client_secret: APP_SECRET, redirect_uri: REDIRECT_URI, code });
    const accessToken = tokenData.access_token;
    if (!accessToken) return back(res, 'token_failed');

    const me = await graph('/me', { fields: 'id,name', access_token: accessToken });
    if (!me.id) return back(res, 'profile_failed');

    const owner = await prisma.user.findUnique({ where: { facebookId: String(me.id) }, select: { id: true } });
    if (owner && owner.id !== st.sub) return back(res, 'already_linked'); // that Facebook account belongs to another ClipPulse user

    // Friends are best-effort: without the user_friends permission (or before app review) the list is empty.
    let friendIds = [];
    let friendsOk = true;
    try {
      friendIds = await fetchFriendIds(accessToken);
    } catch (err) {
      friendsOk = false;
      console.error('[facebook] friends fetch failed:', err.message);
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({ where: { id: st.sub }, data: { facebookId: String(me.id), facebookName: me.name || null, facebookLinkedAt: now, ...(friendsOk ? { facebookSyncedAt: now } : {}) } }),
      ...(friendsOk
        ? [
            prisma.syncedContact.deleteMany({ where: { userId: st.sub, source: 'facebook' } }),
            prisma.syncedContact.createMany({ data: friendIds.map((hash) => ({ userId: st.sub, source: 'facebook', hash })), skipDuplicates: true }),
          ]
        : []),
    ]);
    return back(res, friendsOk ? 'linked' : 'linked_no_friends');
  } catch (err) {
    console.error('[facebook] callback failed:', err.fb?.code || err.code || '', err.message);
    return back(res, err.code === 'P2002' ? 'already_linked' : err.code === 'P2022' ? 'schema_outdated' : 'failed');
  }
}));

// GET /auth/facebook/status
authRouter.get('/status', requireAuth, asyncHandler(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { facebookId: true, facebookName: true, facebookLinkedAt: true, facebookSyncedAt: true } });
  const friendsSynced = u.facebookId ? await prisma.syncedContact.count({ where: { userId: req.userId, source: 'facebook' } }) : 0;
  let matched = 0;
  if (friendsSynced) {
    const ids = (await prisma.syncedContact.findMany({ where: { userId: req.userId, source: 'facebook' }, select: { hash: true } })).map((r) => r.hash);
    matched = await prisma.user.count({ where: { facebookId: { in: ids }, id: { not: req.userId } } });
  }
  res.json({ configured: configured(), linked: !!u.facebookId, name: u.facebookName, linkedAt: u.facebookLinkedAt, syncedAt: u.facebookSyncedAt, friendsSynced, matched });
}));

// DELETE /auth/facebook  — unlink and delete everything synced from Facebook.
authRouter.delete('/', requireAuth, asyncHandler(async (req, res) => {
  await prisma.$transaction([
    prisma.user.update({ where: { id: req.userId }, data: { facebookId: null, facebookName: null, facebookLinkedAt: null, facebookSyncedAt: null } }),
    prisma.syncedContact.deleteMany({ where: { userId: req.userId, source: 'facebook' } }),
  ]);
  res.json({ linked: false });
}));

// POST /friends/facebook-sync  → { url } — refreshes the friend list (repeats the login; no prompt if already authorised).
friendsRouter.post('/facebook-sync', requireAuth, asyncHandler(async (req, res) => {
  if (!configured()) return res.status(503).json({ error: 'Facebook linking isn’t set up on this server yet.', code: 'facebook_not_configured' });
  const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { facebookId: true } });
  if (!u?.facebookId) return res.status(409).json({ error: 'Link your Facebook account first.' });
  res.json({ url: authUrl(req.userId) });
}));

// GET /friends/facebook — Facebook friends who are on ClipPulse (and linked Facebook there too).
friendsRouter.get('/facebook', requireAuth, asyncHandler(async (req, res) => {
  const ids = (await prisma.syncedContact.findMany({ where: { userId: req.userId, source: 'facebook' }, select: { hash: true } })).map((r) => r.hash);
  if (!ids.length) return res.json([]);
  const blocks = await prisma.block.findMany({ where: { OR: [{ blockerId: req.userId }, { blockedId: req.userId }] }, select: { blockerId: true, blockedId: true } });
  const blocked = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
  blocked.delete(req.userId);
  const users = await prisma.user.findMany({
    where: { facebookId: { in: ids }, id: { notIn: [req.userId, ...blocked] }, accountStatus: { notIn: ['banned', 'suspended'] } },
    select: { id: true, username: true, displayName: true, avatarUrl: true, facebookName: true },
    take: 200,
  });
  const follows = await prisma.follow.findMany({ where: { followerId: req.userId, followeeId: { in: users.map((u) => u.id) } }, select: { followeeId: true } });
  const following = new Set(follows.map((f) => f.followeeId));
  res.json(users.map((u) => ({ ...u, isFollowing: following.has(u.id) })));
}));
