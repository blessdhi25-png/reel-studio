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

// NOTE: this file previously contained an UNRESOLVED git merge conflict —
// literal <<<<<<< HEAD / ======= / >>>>>>> markers committed as-is, which
// is invalid JavaScript and crashes the entire backend on boot (not just
// this router — the whole process fails to start, since server.js imports
// this file at the top level). That's the real root cause behind every
// admin page "failing to work." Resolved below by keeping the
// controller-based approach (adminController.js) for user status/role
// changes, hard video delete, and paginated audit log — since that's what
// the current frontend (admin/users/page.jsx, admin/audit-log/page.jsx)
// already calls — while keeping the single, non-duplicated copy of
// everything else both sides of the conflict agreed on.
const router = Router();

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
  res.json({
    queueStatus: pendingReports > 25 ? 'backlogged' : 'healthy',
    pendingReports,
    moderatorCount,
  });
}));

// ---------------------------------------------------------------------------
// Reports
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

// PATCH /users/:id/status is the generic entry point (see
// controllers/adminController.js). The three POST routes below are kept as
// thin wrappers around that exact same handler, purely so the pre-existing
// frontend calls (api.adminSuspendUser/adminBanUser/adminReinstateUser,
// used by admin/users/page.jsx) keep working unchanged — both call shapes
// always behave identically since there's only one place (updateUserStatus)
// that actually implements this.
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
// Both verbs point at the same handler: POST is what the existing frontend
// (api.adminChangeRole) already calls, PATCH is the shape for any new
// caller.
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

// Soft remove — flips status to 'removed' but keeps the row (and the
// content itself) intact, for cases where you want it hidden but preserved
// as evidence (repeat-offender pattern building, appeals).
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
// this is deliberately separate from the soft /remove route above (DMCA,
// CSAM — cases where the content must actually be gone, not just hidden).
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

  const recentLikes = await prisma.like.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: since1h } },
    _count: { userId: true },
    having: { userId: { _count: { gte: 20 } } },
  });

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
      highRiskIps: { count: 0, tracked: false },
      botLikeClusters: { count: botLikeUsers.length, tracked: true },
      multiAccountSignups: { count: bursts.flat().length, tracked: true },
    },
    rows: riskRows,
  });
}));

// ---------------------------------------------------------------------------
// System Audit Logs — paginated (?page=&limit=), see getAuditLog in
// adminController.js. Returns { data, page, limit, total, hasMore }.
// admin/audit-log/page.jsx expects exactly this shape.
// ---------------------------------------------------------------------------

router.get('/audit-log', getAuditLog);

export default router;
