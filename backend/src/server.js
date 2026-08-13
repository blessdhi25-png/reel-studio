import 'dotenv/config';
import express from 'express';
import { standardLimiter } from './middleware/rateLimiter.js';
import cors from 'cors';
import path from 'path';
import { createServer } from 'http';
import { initSocket } from './realtime/socket.js';
import { connectDB } from './config/db.js';

// Prisma returns BigInt for Video.viewCount/likeCount/commentCount.
// JSON.stringify (which res.json() uses) can't serialize BigInt natively —
// without this, any route returning a video silently 500s. Safe to convert
// to Number here since these counts won't realistically exceed
// Number.MAX_SAFE_INTEGER.
BigInt.prototype.toJSON = function () {
  return Number(this);
};

// Without DATABASE_URL set (see connectDB() in config/db.js), or any other
// bug in a route handler, an async route that throws and isn't individually
// wrapped in try/catch becomes an "unhandled rejection" — and Node's
// default behavior since v15 is to terminate the ENTIRE process on those,
// not just fail that one request. That takes down every in-flight and
// future request too, which is what makes a single bad query look like
// the whole server randomly crashing / going unreachable. These two
// handlers log the error instead of letting it kill the process, so one
// broken request degrades gracefully (that request still fails — it just
// doesn't take the server down with it). This is a safety net, not a
// substitute for fixing the underlying cause (e.g. actually setting
// DATABASE_URL) or for routes catching their own errors properly.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import videoRoutes from './routes/videos.js';
import engagementRoutes from './routes/engagement.js';
import monetizationRoutes from './routes/monetization.js';
import discoveryRoutes from './routes/discovery.js';
import paymentsRoutes from './routes/payments.js';
import webhookRoutes from './routes/webhook.js';
import messagesRoutes from './routes/messages.js';
import reportsRoutes from './routes/reports.js';
import adminRoutes from './routes/admin.js';
import notificationsRoutes from './routes/notifications.js';
import liveRoutes from './routes/live.js';
import studioRoutes from './routes/studio.js';
import privacyRoutes from './routes/privacy.js';
import artistRoutes from './routes/artists.js';
import storiesRoutes from './routes/stories.js';
import aiRoutes from './routes/ai.js';
import communitiesRoutes from './routes/communities.js';

const app = express();

// Render (and most PaaS hosts) sit the app behind a reverse proxy — without
// this, req.ip is always the proxy's own internal IP for every request, so
// express-rate-limit would bucket every single user on this deployment
// together under one shared limit instead of limiting per real client.
// `1` means "trust exactly one hop" (Render's own edge proxy), which is
// the correct value here; trusting an arbitrary number of hops would let a
// client spoof X-Forwarded-For to fake a different IP on each request and
// evade the limiter entirely.
app.set('trust proxy', 1);

// CORS: the sign-up "Failed to fetch" seen on mobile/ngrok is caused by the
// frontend calling the wrong URL (see resolveApiBase() in frontend's
// lib/api.js), not by CORS — cors() with no options already reflects any
// request origin. This is made explicit and configurable anyway, since an
// open cors() is easy to accidentally lock down later without realizing it
// breaks ngrok/mobile testing.
//
// ALLOWED_ORIGINS in .env, comma-separated, e.g.:
//   ALLOWED_ORIGINS=http://localhost:3000,https://abcd1234.ngrok-free.app
// The production Vercel frontend is always allowed even if ALLOWED_ORIGINS
// is left unset on Render, so a missing env var can't silently break prod.
const DEFAULT_ALLOWED_ORIGINS = ['https://reel-studio-wine.vercel.app', 'https://active-reel.vercel.app'];
const envOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) || [];
const allowedOrigins = [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...envOrigins])];

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header (curl, server-to-server, some native app webviews)
      // => allow.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // ngrok rotates subdomains on the free tier, so an exact allowlist
      // entry goes stale between sessions — accept any *.ngrok-free.app /
      // *.ngrok.io origin without requiring it to be listed explicitly.
      if (/\.ngrok(-free)?\.app$|\.ngrok\.io$/.test(new URL(origin).hostname)) {
        return callback(null, true);
      }
      // Vercel mints a brand-new hostname for EVERY deployment (e.g.
      // active-reel-ek068bgtv-bless-dhi-s-projects.vercel.app) on top of
      // whatever stable production alias exists — so a single hardcoded
      // origin above goes stale the moment a new preview/prod deploy runs.
      // Accept any *.vercel.app origin under this specific team/project
      // rather than trying to keep every generated hash in sync manually.
      if (/-bless-dhi-s-projects\.vercel\.app$/.test(new URL(origin).hostname)) {
        return callback(null, true);
      }
      // IMPORTANT: never pass an Error here. cors() invokes this inside
      // Express's request-handling flow, and an Error passed to a
      // non-async callback like this bypasses Express's normal error
      // handling and can crash the Node process instead of just failing
      // the one request. Returning `false` makes cors() skip the
      // Access-Control-Allow-Origin header, which the browser reports as
      // a CORS failure on the client (a 403 you can catch) — safe.
      console.warn(`[cors] Rejected origin: ${origin}`);
      callback(null, false);
    },
    credentials: true,
  })
);

// IMPORTANT: the Stripe webhook needs the raw, unparsed body to verify the
// signature — it must be mounted before express.json() below.
app.use('/api/v1/webhooks/stripe', webhookRoutes);

app.use(express.json());

// Standard rate limit for all API traffic (100 req/15min per IP — see
// middleware/rateLimiter.js). Mounted once here, ahead of every route
// below, rather than per-router, so nothing new added later silently ships
// unlimited. The four auth endpoints called out in the security review
// (login, forgot-password, reset-password, change-password) layer the
// much stricter authLimiter on top of this in routes/auth.js — this one
// alone would be far too loose for those.
app.use('/api/v1', standardLimiter);

// Serve transcoded HLS files directly (self-hosted MVP).
// Swap for a CDN URL once you move to a managed storage service.
app.use('/hls', express.static(path.resolve(process.env.HLS_DIR || './storage/hls')));
app.use('/thumbnails', express.static(path.resolve(process.env.THUMBNAILS_DIR || './storage/thumbnails')));

// Serve uploaded profile photos and videos the same way. This must resolve
// to the exact same directory upload.js writes into — using
// process.env.UPLOAD_DIR with the same fallback here as there (see
// utils/upload.js) keeps them from silently drifting apart if one gets
// edited without the other.
const uploadsPath = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsPath));

// Render's health check hits whatever path is configured in the dashboard —
// both are provided so it works regardless of which one is set, and so the
// frontend can probe the versioned path directly.
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/v1/health', (_req, res) => res.json({ ok: true }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/videos', videoRoutes);
app.use('/api/v1', engagementRoutes); // /videos/:id/like, /videos/:id/comments, /comments/:id
app.use('/api/v1', monetizationRoutes); // /users/me/earnings
app.use('/api/v1', paymentsRoutes); // /stripe/connect, /stripe/status, /stripe/dashboard-link, /videos/:id/tip/checkout
app.use('/api/v1', discoveryRoutes); // /search, /trending
app.use('/api/v1', messagesRoutes); // /conversations, /conversations/:otherUserId
app.use('/api/v1', reportsRoutes); // /reports, /reports/mine
app.use('/api/v1/admin', adminRoutes); // moderation dashboard
app.use('/api/v1', notificationsRoutes); // /notifications, /notifications/:id/read
app.use('/api/v1', liveRoutes); // /live, /live/:id, /live/start, /live/:id/end
app.use('/api/v1', studioRoutes); // /studio/overview, /videos/:id/boost/checkout
app.use('/api/v1', privacyRoutes); // /users/me/privacy, /users/:id/block
app.use('/api/v1/artists', artistRoutes); // artist registration, track catalog & analytics
app.use('/api/v1', storiesRoutes); // /stories, /stories/feed, /stories/:id/view|like|poll-vote|qa-response
app.use('/api/v1/ai', aiRoutes); // /ai/generate-captions, /ai/refine-draft (AI Co-Pilot — real Claude calls, rate-limited)
app.use('/api/v1', communitiesRoutes); // /communities, /communities/:id, /communities/:id/join, /communities/:id/posts

// Any request that reached here matched no route above. Returning JSON
// (not Express's default HTML 404 page) matters here specifically because
// a mismatched frontend base URL (e.g. missing /api/v1, or hitting a typo'd
// path) is exactly what was reported as "404/CORS errors" — a plain-text/
// HTML 404 body makes that failure mode harder to distinguish at a glance
// from an actual CORS rejection in the browser's network tab.
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, _next) => {
  // Logging just `err` (as this used to) prints the error's default string
  // form, which for a Prisma error is often only the message — no stack, no
  // indication of which query/field caused it. err.stack has both. Also
  // logging req.method+req.originalUrl means a scroll through Render's logs
  // shows *which* endpoint failed without having to correlate timestamps
  // against the client-side network tab.
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err.stack || err);

  // Prisma's "unknown argument"/"unknown field" errors (P2009, or a plain
  // PrismaClientValidationError when the generated client doesn't match the
  // schema.prisma column list) are the single most common cause of a 500
  // right after a schema change that wasn't followed by `prisma generate` +
  // `prisma migrate deploy` on the deployed environment. Flagging that
  // pattern explicitly in the log saves re-deriving it from a raw stack
  // trace every time it happens.
  const looksLikeSchemaDrift =
    err?.name === 'PrismaClientValidationError' ||
    err?.name === 'PrismaClientKnownRequestError' ||
    /Unknown (arg|field)/i.test(err?.message || '');
  if (looksLikeSchemaDrift) {
    console.error(
      '[error] This looks like a Prisma schema/DB mismatch — confirm `prisma generate` and ' +
        '`prisma migrate deploy` both ran against the DATABASE_URL this environment is actually using.'
    );
  }

  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
const httpServer = createServer(app);
initSocket(httpServer);

// Attempt the DB connection but never let it block/crash server startup —
// see connectDB() in config/db.js for why. Binding the port is what makes
// Render's health check pass, so that has to happen regardless of DB state.
await connectDB();

// Binding to 0.0.0.0 (not the default 127.0.0.1/localhost) is required on
// Render: their port-detection and health checks probe the container from
// outside, and a server only listening on localhost is unreachable from
// there even though it works fine locally.
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`API + realtime listening on 0.0.0.0:${PORT}`);
});
