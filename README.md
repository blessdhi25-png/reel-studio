# Reel — TikTok-style app (short + long video, with tipping)

Self-hosted MVP. Swap to a managed video pipeline (AWS S3 + MediaConvert, or Mux) later —
the API contract (`POST /videos` → worker transcodes → `POST /videos/:id/complete`) doesn't change.

## Stack
- Backend: Node.js, Express, Prisma, PostgreSQL, Socket.IO (notifications + live signaling)
- Video: self-hosted ffmpeg worker → HLS, served as static files
- Frontend: Next.js (App Router), Tailwind, hls.js, socket.io-client, WebRTC

## Backend setup

```bash
cd backend
cp .env.example .env        # edit DATABASE_URL, JWT_SECRET
npm install
npx prisma migrate dev --name init   # run again with a new --name after each schema change noted below
npm run dev                 # starts API + Socket.IO on :4000
```

In a second terminal, start the transcode worker (requires ffmpeg installed on your machine):

```bash
cd backend
npm run worker
```

In a third terminal, start the ranking worker (recomputes feed scores every 30s):

```bash
cd backend
npm run ranking-worker
```

## Frontend setup

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                 # starts on :3000
```

## How a video goes live
1. Client uploads raw file to `POST /api/v1/videos` (multipart) → status `processing`
2. Worker polls the DB, runs ffmpeg, writes HLS output to `storage/hls/:id/`
3. Worker calls `POST /videos/:id/complete` → status `published`
4. Frontend feed (`GET /videos/feed`) picks it up

## Migrating to a managed service later
- Replace `multer` disk storage with a pre-signed S3 upload URL
- Replace the ffmpeg worker with an AWS MediaConvert (or Mux) job trigger
- Point `videoUrl` at the CDN URL instead of your own `/hls` static route
- Everything else (routes, schema, frontend) stays the same

## Stripe payments setup

Uses Stripe Connect (Express accounts) for creator payouts and Stripe Checkout for tips —
money moves directly to the creator's connected account via a destination charge; the
platform keeps a 10% application fee (adjust in `payments.js`).

1. Create a free Stripe account and switch to **test mode**
2. Get your test secret key from the Stripe dashboard → add it as `STRIPE_SECRET_KEY` in `backend/.env`
3. Install the [Stripe CLI](https://stripe.com/docs/stripe-cli) and forward webhooks to your local server:
   ```bash
   stripe listen --forward-to localhost:4000/api/v1/webhooks/stripe
   ```
   This prints a webhook signing secret (`whsec_...`) — put it in `STRIPE_WEBHOOK_SECRET`
4. Restart the backend after editing `.env`

**Flow to test tipping end-to-end:**
- Log in as a creator, go to `/earnings`, click **Set up payouts** — this walks through
  Stripe's Express onboarding (use their test data: e.g. SSN `000-00-0000`, any test bank
  account routing/account numbers from [Stripe's test docs](https://stripe.com/docs/connect/testing))
- Log in as a different user, tip that creator's video — you'll land on Stripe's hosted
  Checkout page (use test card `4242 4242 4242 4242`, any future expiry, any CVC)
- After payment, the webhook flips the transaction to `completed` and it shows up on the
  creator's `/earnings` page

## Trust & safety / admin team (implemented)

Roles: `user`, `moderator`, `admin`. Account status: `active`, `suspended`, `banned`.

**Bootstrapping your first admin** — there's intentionally no self-serve way to become
one. After creating your own account through the normal signup flow, run:
```bash
cd backend
node scripts/promote-admin.js you@example.com admin
```

**What the team gets** (all under `/admin` in the frontend, gated server-side by role):
- **Reports queue** (`/admin/reports`) — anyone can report a video, user, or comment from
  the UI (flag icon on videos, "Report" on profiles); moderators triage and resolve with
  dismiss / warn / remove content / suspend / ban. Every resolution is logged.
- **User management** (`/admin/users`) — search, suspend, ban (admin-only), reinstate, and
  grant/revoke moderator status. Suspended/banned users are blocked at the API level
  (`requireAuth` checks `accountStatus` on every request) — they can't post, tip, message,
  or interact even if they still have a valid token, and are blocked at login too.
- **Video moderation queue** (`/admin/videos`) — filter by status, see report counts per
  video, remove content directly.
- **Fraud signals** (`/admin/fraud-signals`) — lightweight heuristics: most-reported
  accounts in the last 30 days, accounts sending 10+ tips in 24h, accounts with repeated
  failed payments. These are signals to help a human triage, not automated verdicts — the
  team still reviews and acts through the reports/users pages.
- **Audit log** (`/admin/audit-log`) — every suspend/ban/reinstate/remove/role-change is
  recorded with which admin did it and when. This is what makes the team's actions
  accountable, not just powerful.

**Design choices worth knowing:**
- Only full `admin` (not `moderator`) can ban or change roles — banning is permanent and
  role changes affect who else has power, so those stay behind a higher bar
  (`requireRole('admin')` on those specific routes)
- `child_safety` is a distinct report reason that gets logged separately from the normal
  queue so it's easy to alert on and prioritize — the actual handling process (immediate
  escalation, law enforcement reporting where required) is a policy/ops decision your team
  needs to define; this just makes sure those reports are never buried in a general queue
- Fraud detection here is intentionally simple (report counts + tip velocity + failed
  payments). Real fraud/spam detection at scale usually means a dedicated pipeline
  (device fingerprinting, ML risk scoring, etc.) — this gives your team a starting point
  and a place to plug that in later without changing how reports/actions work

## Profile photos, Studio, Promote & Offline videos (implemented)
- **Profile photos** — `POST /users/me/avatar` (multipart, field name `avatar`) accepts a real
  JPG/PNG/WEBP/GIF up to 8MB, stores it under `UPLOAD_DIR/avatars/`, and serves it back over
  `/uploads` (added as a static route in `server.js`). The edit-profile page uploads on selection
  rather than waiting for the whole form to save.
- **TikTok Studio** (`/studio`) — `GET /studio/overview` aggregates a creator's own totals
  (views/likes/comments/saves/followers) plus a per-video breakdown, all read from existing
  columns — no new tracking needed.
- **Promote** (`/promote`) — pay-to-boost a published video for 24h/3d/7d via a plain Stripe
  Checkout Session (money goes to the platform, not a Connect transfer, since this isn't a
  creator payout). The webhook sets `Video.boostedUntil` on `checkout.session.completed`, and the
  ranking worker gives boosted videos a 5x score multiplier while the boost is active.
- **Offline videos** (`/offline`) — downloads a bookmarked video's HLS playlist and every segment
  into the browser's Cache Storage API (no service worker needed), then rebuilds a self-contained
  playlist from `blob:` URLs for offline playback. This makes a video playable inside the app
  without a connection — it's not exported as a file you can save elsewhere.

**New migration required** — this adds `boostedUntil` to `Video` and a `boost` value to
`TransactionType`:
```bash
cd backend
npx prisma migrate dev --name add_boost
```

## What's stubbed for MVP
- Auth token revocation: JWTs are stateless; add a Redis blocklist for real logout

## Private messaging (implemented)
- `/messages` — inbox listing conversations, most recent first, with unread counts
- `/messages/:userId` — a single thread, polling every 4s for new messages (no websockets yet)
- You can message someone only if a follow relationship exists in either direction
  (you follow them, or they follow you) — enforced server-side in `routes/messages.js`
- "Message" button lives on profile pages next to Follow
- Swap-in path for real-time: replace the polling in `messages/[userId]/page.jsx` with
  a WebSocket or SSE connection once you need instant delivery

## Feed ranking (implemented)
- The frontend logs `impression`, `watch_complete`, and `skip` events per video via
  `POST /videos/:id/events` (skip = scrolled away before 50% watched)
- The ranking worker (`npm run ranking-worker`) recomputes each video's `rankingScore`
  every 30s from views/likes/comments/shares/completions, weighted and penalized for
  skips, with a recency decay (score halves roughly every 36 hours)
- `GET /videos/feed` defaults to `sort=ranked` (orders by `rankingScore`); pass
  `?sort=recent` for plain reverse-chronological
- Swap-in path: once you have real scale, move the aggregation into Redis sorted sets
  updated incrementally instead of a periodic full recompute

## Notifications (implemented)
- Fired for: new follower, like, comment, tip received, new message, live-start from
  someone you follow, and account moderation actions (suspend/ban/reinstate)
- Delivered two ways at once: written to the `Notification` table (so `/notifications`
  always has full history) and pushed instantly over the same Socket.IO connection used
  for live streaming (`notification:new` event) — no polling needed while the tab is open
- The bell icon ("Alerts") in the feed nav shows an unread badge that updates live
- `routes/utils/notify.js` is the single call site every other route uses — add a new
  notification type there rather than writing to the table directly elsewhere

## Live streaming & video chat (implemented)
Real-time infrastructure: Socket.IO (`realtime/socket.js`) handles both notifications and
live-stream signaling over one connection, authenticated via the same JWT used for the
REST API.

- `/live` — browse currently-live streams, or "Go live" to start your own
  (`POST /live/start`, blocked if you already have one running)
- `/live/:id` — the room itself. Everyone who joins — host included — is a symmetric
  peer: camera/mic via `getUserMedia`, a full-mesh WebRTC connection to every other
  participant (so it doubles as live chat *and* group video conferencing, not just
  one-way broadcast), plus a text chat panel over the socket
- Signaling flow: a joining peer gets the list of who's already in the room
  (`live:existing-peers`), sends them a WebRTC offer each; existing peers just wait for
  it and answer. ICE candidates relay through the server via `live:signal`
- **Scale ceiling — read this before using it for anything but small groups:** full-mesh
  WebRTC means every participant uploads their stream directly to every other
  participant, so bandwidth cost is O(n²). It's fine for small rooms (a handful of
  people); it falls over well before "TikTok LIVE with thousands of viewers" territory.
  For real scale, swap the mesh for an SFU (Selective Forwarding Unit) — LiveKit,
  mediasoup, or a managed service like Agora/Mux — where each participant uploads once
  and the server fans it out. The signaling *shape* (join → offer/answer → media flows)
  stays conceptually similar; you'd replace `realtime/socket.js`'s peer-to-peer relay
  with calls to the SFU's API, and the frontend's `RTCPeerConnection` calls with that
  SFU's client SDK
- Ended streams aren't deleted, just marked `status: ended` — useful if you want to add
  VOD replay later

