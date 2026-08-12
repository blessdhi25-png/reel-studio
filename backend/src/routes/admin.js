import { Router } from 'express';
import prisma from '../config/db.js';
import { authenticateUser, authorizeRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  updateUserStatus,
  updateUserRole,
  hardDeleteVideo,
  getAuditLog,
} from '../controllers/adminController.js';

// This file previously contained a stray duplicate of auth.js's contents
// (register/login/Google OAuth) instead of any actual admin routes — every
// admin page in the frontend has been calling endpoints
// (/admin/me, /admin/users, /admin/videos, /admin/fraud-signals,
// /admin/audit-log, /admin/reports*, /admin/status) that never existed on
// the backend at all, despite server.js correctly mounting this file at
// /api/v1/admin. This is the real implementation.

// This file previously contained a stray duplicate of auth.js's contents
// (register/login/Google OAuth) instead of any actual admin routes — every
// admin page in the frontend has been calling endpoints
// (/admin/me, /admin/users, /admin/videos, /admin/fraud-signals,
// /admin/audit-log, /admin/reports*, /admin/status) that never existed on
// the backend at all, despite server.js correctly mounting this file at
// /api/v1/admin. This is the real implementation.

const router = Router();

// Every route below requires a signed-in moderator or admin. Applied once
// here via router.use (rather than per-route) so nothing added later to
// this file can accidentally be left unprotected. authorizeRoles takes the
// database's actual lowercase role values ('moderator' | 'admin' — see the
// UserRole enum in prisma/schema.prisma), not 'MODERATOR'/'ADMIN'.
router.use(authenticateUser, authorizeRoles('moderator', 'admin'));

// ---------------------------------------------------------------------------
// Access check + status strip (used by admin/layout.jsx)
// ---------------------------------------------------------------------------

router.get('/me', asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, username: true, role: true },
  });
  res.json(user);
}));

router.get('/status', asyncHandler(async (req, res) => {
  const [pendingReports, moderatorCount] = await Promise.all([
    prisma.report.count({ where: { status: 'pending' } }),
    prisma.user.count({ where: { role: { in: ['moderator', 'admin'] } } }),
  ]);
  // "Healthy" vs "Backlogged" is a simple threshold on the pending queue —
  // there's no SLA-tracking infrastructure to base this on, so this is a
  // reasonable proxy rather than a precise measurement.
  res.json({
    queueStatus: pendingReports > 25 ? 'backlogged' : 'healthy',
    pendingReports,
    moderatorCount,
  });
}));

// ---------------------------------------------------------------------------
// Reports (pre-existing pages — /admin/moderation, /admin/reports — depend
// on these; kept working while rebuilding this file rather than leaving them
// broken too)
// ---------------------------------------------------------------------------

router.get('/reports', asyncHandler(async (req, res) => {
  const { status = 'pending', search = '' } = req.query;
  const where = {};
  if (status !== 'all') where.status = status;
  if (search) {
    where.reporter = {
      OR: [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    };
  }
  const reports = await prisma.report.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { reporter: { select: { id: true, username: true, avatarUrl: true } } },
  });
  res.json(reports);
}));

router.get('/reports/stats', asyncHandler(async (req, res) => {
  const [pending, reviewing, resolved, dismissed] = await Promise.all([
    prisma.report.count({ where: { status: 'pending' } }),
    prisma.report.count({ where: { status: 'reviewing' } }),
    prisma.report.count({ where: { status: 'resolved' } }),
    prisma.report.count({ where: { status: 'dismissed' } }),
  ]);
  res.json({ pending, reviewing, resolved, dismissed });
}));

router.post('/reports/:id/resolve', asyncHandler(async (req, res) => {
  const { action, note } = req.body; // action: 'resolved' | 'dismissed'
  const status = action === 'dismissed' ? 'dismissed' : 'resolved';
  const report = await prisma.report.update({
    where: { id: req.params.id },
    data: { status, resolution: note || null, resolvedById: req.userId, resolvedAt: new Date() },
  });
  await prisma.adminAction.create({
    data: {
      adminId: req.userId,
      actionType: status === 'dismissed' ? 'dismiss_report' : 'resolve_report',
      targetType: report.targetType,
      targetId: report.targetId,
      reason: note || null,
    },
  });
  res.json(report);
}));

// ---------------------------------------------------------------------------
// User Management
// ---------------------------------------------------------------------------

router.get('/users', asyncHandler(async (req, res) => {
  const { search = '', role = '', status = '' } = req.query;
  const where = {};
  if (search) {
    where.OR = [
      { username: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (role) where.role = role;
  if (status) where.accountStatus = status;

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, username: true, email: true, avatarUrl: true, role: true,
      accountStatus: true, statusReason: true, createdAt: true,
      _count: { select: { videos: true } },
    },
  });

  // Reports filed *against* each user (i.e. targeting their account) —
  // not on the User select above since Report.targetId is a loose string
  // reference (it covers users/videos/comments), not a Prisma relation.
  const userIds = users.map((u) => u.id);
  const reportCounts = userIds.length
    ? await prisma.report.groupBy({
        by: ['targetId'],
        where: { targetType: 'user', targetId: { in: userIds } },
        _count: { targetId: true },
      })
    : [];
  const reportMap = Object.fromEntries(reportCounts.map((r) => [r.targetId, r._count.targetId]));

  res.json(users.map((u) => ({ ...u, reportsAgainstCount: reportMap[u.id] || 0 })));
}));

<<<<<<< HEAD
async function logAdminAction(adminId, actionType, targetId, reason) {
  await prisma.adminAction.create({
    data: { adminId, actionType, targetType: 'user', targetId, reason: reason || null },
  });
}

router.post('/users/:id/suspend', asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { accountStatus: 'suspended', statusReason: reason || null },
  });
  await logAdminAction(req.userId, 'suspend_user', user.id, reason);
  res.json(user);
}));

router.post('/users/:id/ban', asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { accountStatus: 'banned', statusReason: reason || null },
  });
  await logAdminAction(req.userId, 'ban_user', user.id, reason);
  res.json(user);
}));

router.post('/users/:id/reinstate', asyncHandler(async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { accountStatus: 'active', statusReason: null },
  });
  await logAdminAction(req.userId, 'reinstate_user', user.id, null);
  res.json(user);
}));

router.post('/users/:id/role', authorizeRoles('admin'), asyncHandler(async (req, res) => {
  // Role changes are admin-only, not moderator — a moderator promoting
  // themselves or others to admin would be a privilege-escalation hole.
  const { role } = req.body;
  if (!['user', 'moderator', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { role } });
  await logAdminAction(req.userId, 'change_role', user.id, `role -> ${role}`);
  res.json(user);
}));

// ---------------------------------------------------------------------------
// Video Queue
// ---------------------------------------------------------------------------

router.get('/videos', asyncHandler(async (req, res) => {
  const { status = 'published' } = req.query;
  const where = status === 'all' ? {} : { status };

  const videos = await prisma.video.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { user: { select: { id: true, username: true, avatarUrl: true } } },
  });

  const videoIds = videos.map((v) => v.id);
  const reportCounts = videoIds.length
    ? await prisma.report.groupBy({
        by: ['targetId'],
        where: { targetType: 'video', targetId: { in: videoIds } },
        _count: { targetId: true },
      })
    : [];
  const reportMap = Object.fromEntries(reportCounts.map((r) => [r.targetId, r._count.targetId]));

  res.json(
    videos.map((v) => ({
      ...v,
      viewCount: Number(v.viewCount),
      likeCount: Number(v.likeCount),
      commentCount: Number(v.commentCount),
      reportsCount: reportMap[v.id] || 0,
    }))
  );
}));

router.get('/videos/:id/flags', asyncHandler(async (req, res) => {
  const reports = await prisma.report.findMany({
    where: { targetType: 'video', targetId: req.params.id },
    orderBy: { createdAt: 'desc' },
    include: { reporter: { select: { id: true, username: true } } },
  });
  res.json(reports);
}));

router.post('/videos/:id/remove', asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const video = await prisma.video.update({
    where: { id: req.params.id },
    data: { status: 'removed' },
  });
  await prisma.adminAction.create({
    data: {
      adminId: req.userId,
      actionType: 'remove_video',
      targetType: 'video',
      targetId: video.id,
      reason: reason || null,
    },
  });
  res.json(video);
}));

// ---------------------------------------------------------------------------
// Fraud & Risk Signals
// ---------------------------------------------------------------------------
//
// Honest limitation, stated here rather than hidden in the response shape:
// this app has never logged IP addresses anywhere (no field for it on User,
// no session/login table), so "High Risk IPs" cannot be computed from real
// data — it's returned as a fixed 0 with a `tracked: false` flag rather
// than a fabricated number. Signup bursts and like-velocity clusters ARE
// computed from real data (User.createdAt and Like.createdAt), though both
// are coarse heuristics — a real fraud pipeline would use device
// fingerprints, IP correlation, and behavioral ML, none of which exist
// here. These are meant for human triage, not automated verdicts.
router.get('/fraud-signals', asyncHandler(async (req, res) => {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since1h = new Date(now.getTime() - 60 * 60 * 1000);

  // Bot-like clusters: accounts that liked an unusually large number of
  // videos in the last hour. Real behavioral signal (from real Like rows),
  // just a simple threshold rather than a trained classifier.
  const recentLikes = await prisma.like.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: since1h } },
    _count: { userId: true },
    having: { userId: { _count: { gte: 20 } } },
  });

  // Multi-account signups: users created within the same rolling 10-minute
  // window, grouped by that window. This is a burst-detection proxy, not
  // true multi-accounting detection (which needs IP/device data this app
  // doesn't capture) — labeled as such in the response.
  const recentSignups = await prisma.user.findMany({
    where: { createdAt: { gte: since24h } },
    select: { id: true, username: true, email: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const burstWindowMs = 10 * 60 * 1000;
  const bursts = [];
  let windowStart = null;
  let windowUsers = [];
  for (const u of recentSignups) {
    if (!windowStart || u.createdAt - windowStart > burstWindowMs) {
      if (windowUsers.length >= 3) bursts.push([...windowUsers]);
      windowStart = u.createdAt;
      windowUsers = [u];
    } else {
      windowUsers.push(u);
    }
  }
  if (windowUsers.length >= 3) bursts.push(windowUsers);

  const [botLikeUsers, mostReportedRows] = await Promise.all([
    recentLikes.length
      ? prisma.user.findMany({
          where: { id: { in: recentLikes.map((r) => r.userId) } },
          select: { id: true, username: true, avatarUrl: true, createdAt: true },
        })
      : [],
    prisma.report.groupBy({
      by: ['targetId'],
      where: { targetType: 'user', createdAt: { gte: since24h } },
      _count: { targetId: true },
      having: { targetId: { _count: { gte: 3 } } },
    }),
  ]);
  const likeCountMap = Object.fromEntries(recentLikes.map((r) => [r.userId, r._count.userId]));

  const mostReportedUsers = mostReportedRows.length
    ? await prisma.user.findMany({
        where: { id: { in: mostReportedRows.map((r) => r.targetId) } },
        select: { id: true, username: true, avatarUrl: true },
      })
    : [];
  const reportCountMap = Object.fromEntries(mostReportedRows.map((r) => [r.targetId, r._count.targetId]));

  // Unified risk table: each signal type contributes rows with a 0-100
  // score. Scores are a simple normalized heuristic per signal type, not a
  // calibrated probability — intended for sorting/triage, not as a
  // precise measurement.
  const riskRows = [
    ...botLikeUsers.map((u) => ({
      userId: u.id,
      username: u.username,
      avatarUrl: u.avatarUrl,
      riskScore: Math.min(100, 40 + likeCountMap[u.id]),
      trigger: `${likeCountMap[u.id]} likes in the last hour`,
      signal: 'bot_like_cluster',
    })),
    ...mostReportedUsers.map((u) => ({
      userId: u.id,
      username: u.username,
      avatarUrl: u.avatarUrl,
      riskScore: Math.min(100, 30 + reportCountMap[u.id] * 10),
      trigger: `${reportCountMap[u.id]} reports in the last 24h`,
      signal: 'reported_frequently',
    })),
    ...bursts.flatMap((group) =>
      group.map((u) => ({
        userId: u.id,
        username: u.username,
        avatarUrl: null,
        riskScore: Math.min(100, 20 + group.length * 5),
        trigger: `1 of ${group.length} accounts created within 10 minutes of each other`,
        signal: 'signup_burst',
      }))
    ),
  ].sort((a, b) => b.riskScore - a.riskScore);

  res.json({
    summary: {
      highRiskIps: { count: 0, tracked: false }, // see comment above — no IP data exists to compute this
      botLikeClusters: { count: botLikeUsers.length, tracked: true },
      multiAccountSignups: { count: bursts.flat().length, tracked: true },
    },
    rows: riskRows,
  });
}));

// ---------------------------------------------------------------------------
// System Audit Logs
// ---------------------------------------------------------------------------

router.get('/audit-log', asyncHandler(async (req, res) => {
  const actions = await prisma.adminAction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: { admin: { select: { id: true, username: true } } },
  });
  res.json(actions);
}));
=======
// ---------------------------------------------------------------------------
// User Management — status (suspend/ban/reinstate) & role
// ---------------------------------------------------------------------------
//
// PATCH /users/:id/status is the generic entry point (see
// controllers/adminController.js). The three POST routes below are kept
// as thin wrappers around the exact same handler — purely so the
// pre-existing frontend calls (api.adminSuspendUser/adminBanUser/
// adminReinstateUser, used by admin/users/page.jsx) keep working
// unchanged; they inject the fixed status onto req.body and then run the
// identical logic, so both call shapes always behave identically and
// there's only one place (updateUserStatus) that actually implements this.
function withFixedStatus(status) {
  return (req, res, next) => {
    req.body = { ...req.body, status };
    updateUserStatus(req, res, next);
  };
}

router.post('/users/:id/suspend', withFixedStatus('suspended'));
router.post('/users/:id/ban', withFixedStatus('banned'));
router.post('/users/:id/reinstate', withFixedStatus('active'));
router.patch('/users/:id/status', updateUserStatus);

// Role changes are admin-only, not moderator — a moderator promoting
// themselves or others to admin would be a privilege-escalation hole.
// Both verbs point at the same handler for the same reason as above: POST
// is what the existing frontend (api.adminChangeRole) already calls, PATCH
// is the route shape requested for any new caller.
router.post('/users/:id/role', authorizeRoles('admin'), updateUserRole);
router.patch('/users/:id/role', authorizeRoles('admin'), updateUserRole);

// ---------------------------------------------------------------------------
// Video Queue
// ---------------------------------------------------------------------------

router.get('/videos', asyncHandler(async (req, res) => {
  const { status = 'published' } = req.query;
  const where = status === 'all' ? {} : { status };

  const videos = await prisma.video.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { user: { select: { id: true, username: true, avatarUrl: true } } },
  });

  const videoIds = videos.map((v) => v.id);
  const reportCounts = videoIds.length
    ? await prisma.report.groupBy({
        by: ['targetId'],
        where: { targetType: 'video', targetId: { in: videoIds } },
        _count: { targetId: true },
      })
    : [];
  const reportMap = Object.fromEntries(reportCounts.map((r) => [r.targetId, r._count.targetId]));

  res.json(
    videos.map((v) => ({
      ...v,
      viewCount: Number(v.viewCount),
      likeCount: Number(v.likeCount),
      commentCount: Number(v.commentCount),
      reportsCount: reportMap[v.id] || 0,
    }))
  );
}));

router.get('/videos/:id/flags', asyncHandler(async (req, res) => {
  const reports = await prisma.report.findMany({
    where: { targetType: 'video', targetId: req.params.id },
    orderBy: { createdAt: 'desc' },
    include: { reporter: { select: { id: true, username: true } } },
  });
  res.json(reports);
}));

router.post('/videos/:id/remove', asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const video = await prisma.video.update({
    where: { id: req.params.id },
    data: { status: 'removed' },
  });
  await prisma.adminAction.create({
    data: {
      adminId: req.userId,
      actionType: 'remove_video',
      targetType: 'video',
      targetId: video.id,
      reason: reason || null,
    },
  });
  res.json(video);
}));

// Permanent takedown — see hardDeleteVideo in adminController.js for why
// this is deliberately separate from the soft /remove route above.
router.delete('/videos/:id', hardDeleteVideo);

// ---------------------------------------------------------------------------
// Fraud & Risk Signals
// ---------------------------------------------------------------------------
//
// Honest limitation, stated here rather than hidden in the response shape:
// this app has never logged IP addresses anywhere (no field for it on User,
// no session/login table), so "High Risk IPs" cannot be computed from real
// data — it's returned as a fixed 0 with a `tracked: false` flag rather
// than a fabricated number. Signup bursts and like-velocity clusters ARE
// computed from real data (User.createdAt and Like.createdAt), though both
// are coarse heuristics — a real fraud pipeline would use device
// fingerprints, IP correlation, and behavioral ML, none of which exist
// here. These are meant for human triage, not automated verdicts.
router.get('/fraud-signals', asyncHandler(async (req, res) => {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since1h = new Date(now.getTime() - 60 * 60 * 1000);

  // Bot-like clusters: accounts that liked an unusually large number of
  // videos in the last hour. Real behavioral signal (from real Like rows),
  // just a simple threshold rather than a trained classifier.
  const recentLikes = await prisma.like.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: since1h } },
    _count: { userId: true },
    having: { userId: { _count: { gte: 20 } } },
  });

  // Multi-account signups: users created within the same rolling 10-minute
  // window, grouped by that window. This is a burst-detection proxy, not
  // true multi-accounting detection (which needs IP/device data this app
  // doesn't capture) — labeled as such in the response.
  const recentSignups = await prisma.user.findMany({
    where: { createdAt: { gte: since24h } },
    select: { id: true, username: true, email: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const burstWindowMs = 10 * 60 * 1000;
  const bursts = [];
  let windowStart = null;
  let windowUsers = [];
  for (const u of recentSignups) {
    if (!windowStart || u.createdAt - windowStart > burstWindowMs) {
      if (windowUsers.length >= 3) bursts.push([...windowUsers]);
      windowStart = u.createdAt;
      windowUsers = [u];
    } else {
      windowUsers.push(u);
    }
  }
  if (windowUsers.length >= 3) bursts.push(windowUsers);

  const [botLikeUsers, mostReportedRows] = await Promise.all([
    recentLikes.length
      ? prisma.user.findMany({
          where: { id: { in: recentLikes.map((r) => r.userId) } },
          select: { id: true, username: true, avatarUrl: true, createdAt: true },
        })
      : [],
    prisma.report.groupBy({
      by: ['targetId'],
      where: { targetType: 'user', createdAt: { gte: since24h } },
      _count: { targetId: true },
      having: { targetId: { _count: { gte: 3 } } },
    }),
  ]);
  const likeCountMap = Object.fromEntries(recentLikes.map((r) => [r.userId, r._count.userId]));

  const mostReportedUsers = mostReportedRows.length
    ? await prisma.user.findMany({
        where: { id: { in: mostReportedRows.map((r) => r.targetId) } },
        select: { id: true, username: true, avatarUrl: true },
      })
    : [];
  const reportCountMap = Object.fromEntries(mostReportedRows.map((r) => [r.targetId, r._count.targetId]));

  // Unified risk table: each signal type contributes rows with a 0-100
  // score. Scores are a simple normalized heuristic per signal type, not a
  // calibrated probability — intended for sorting/triage, not as a
  // precise measurement.
  const riskRows = [
    ...botLikeUsers.map((u) => ({
      userId: u.id,
      username: u.username,
      avatarUrl: u.avatarUrl,
      riskScore: Math.min(100, 40 + likeCountMap[u.id]),
      trigger: `${likeCountMap[u.id]} likes in the last hour`,
      signal: 'bot_like_cluster',
    })),
    ...mostReportedUsers.map((u) => ({
      userId: u.id,
      username: u.username,
      avatarUrl: u.avatarUrl,
      riskScore: Math.min(100, 30 + reportCountMap[u.id] * 10),
      trigger: `${reportCountMap[u.id]} reports in the last 24h`,
      signal: 'reported_frequently',
    })),
    ...bursts.flatMap((group) =>
      group.map((u) => ({
        userId: u.id,
        username: u.username,
        avatarUrl: null,
        riskScore: Math.min(100, 20 + group.length * 5),
        trigger: `1 of ${group.length} accounts created within 10 minutes of each other`,
        signal: 'signup_burst',
      }))
    ),
  ].sort((a, b) => b.riskScore - a.riskScore);

  res.json({
    summary: {
      highRiskIps: { count: 0, tracked: false }, // see comment above — no IP data exists to compute this
      botLikeClusters: { count: botLikeUsers.length, tracked: true },
      multiAccountSignups: { count: bursts.flat().length, tracked: true },
    },
    rows: riskRows,
  });
}));

// ---------------------------------------------------------------------------
// System Audit Logs
// ---------------------------------------------------------------------------

// See getAuditLog in adminController.js — now paginated (?page=&limit=),
// returning { data, page, limit, total, hasMore } instead of a flat array.
// frontend/src/app/admin/audit-log/page.jsx was updated to match.
router.get('/audit-log', getAuditLog);
>>>>>>> f194879 (Add admin user status/role routes, hard video delete, paginated audit log)

export default router;
