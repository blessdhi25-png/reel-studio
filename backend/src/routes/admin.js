import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { notify } from '../utils/notify.js';

const router = Router();

// Every route below requires an authenticated moderator or admin.
router.use(requireAuth, requireRole('moderator', 'admin'));

function logAction(adminId, actionType, targetType, targetId, reason) {
  return prisma.adminAction.create({
    data: { adminId, actionType, targetType, targetId, reason: reason || null },
  });
}

// ---- Reports queue ----

router.get('/reports', async (req, res) => {
  const { status = 'pending', search } = req.query;
  const reports = await prisma.report.findMany({
    where: status === 'all' ? {} : { status },
    orderBy: { createdAt: 'asc' }, // oldest first — first in, first reviewed
    take: 100,
    include: { reporter: { select: { id: true, username: true } } },
  });

  // Report only stores a generic targetType/targetId (no typed FK), so batch
  // -fetch a preview of whatever each report points at, grouped by type.
  const idsByType = { video: [], user: [], comment: [] };
  for (const r of reports) idsByType[r.targetType]?.push(r.targetId);

  const [videos, users, comments] = await Promise.all([
    idsByType.video.length
      ? prisma.video.findMany({
          where: { id: { in: idsByType.video } },
          select: {
            id: true, caption: true, thumbnailUrl: true, status: true,
            user: { select: { id: true, username: true } },
          },
        })
      : [],
    idsByType.user.length
      ? prisma.user.findMany({
          where: { id: { in: idsByType.user } },
          select: { id: true, username: true, avatarUrl: true, accountStatus: true },
        })
      : [],
    idsByType.comment.length
      ? prisma.comment.findMany({
          where: { id: { in: idsByType.comment } },
          select: { id: true, content: true, user: { select: { id: true, username: true } } },
        })
      : [],
  ]);
  const videoMap = Object.fromEntries(videos.map((v) => [v.id, v]));
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  const commentMap = Object.fromEntries(comments.map((c) => [c.id, c]));

  let enriched = reports.map((r) => ({
    ...r,
    target:
      r.targetType === 'video' ? videoMap[r.targetId] || null
      : r.targetType === 'user' ? userMap[r.targetId] || null
      : r.targetType === 'comment' ? commentMap[r.targetId] || null
      : null,
  }));

  if (search) {
    const q = search.toLowerCase();
    enriched = enriched.filter((r) => {
      const targetUsername = r.target?.username || r.target?.user?.username || '';
      return (
        r.reporter?.username?.toLowerCase().includes(q) ||
        targetUsername.toLowerCase().includes(q) ||
        r.details?.toLowerCase().includes(q) ||
        r.target?.caption?.toLowerCase().includes(q) ||
        r.target?.content?.toLowerCase().includes(q)
      );
    });
  }

  res.json(enriched);
});

// Summary metrics for the Trust & Safety overview banner.
router.get('/reports/stats', async (req, res) => {
  const [total, pending, resolvedRecent] = await Promise.all([
    prisma.report.count(),
    prisma.report.count({ where: { status: 'pending' } }),
    prisma.report.findMany({
      where: { status: { in: ['resolved', 'dismissed'] }, resolvedAt: { not: null } },
      orderBy: { resolvedAt: 'desc' },
      take: 200,
      select: { createdAt: true, resolvedAt: true },
    }),
  ]);

  const critical = await prisma.report.count({
    where: { status: 'pending', reason: { in: ['impersonation', 'harassment_or_abuse'] } },
  });

  let avgResolutionMinutes = null;
  if (resolvedRecent.length > 0) {
    const totalMinutes = resolvedRecent.reduce(
      (sum, r) => sum + (r.resolvedAt.getTime() - r.createdAt.getTime()) / 60000,
      0
    );
    avgResolutionMinutes = Math.round(totalMinutes / resolvedRecent.length);
  }

  res.json({ total, pending, critical, avgResolutionMinutes });
});

// Resolve a report with an action taken against the target.
// action: 'dismiss' | 'warn' | 'remove_content' | 'suspend_user' | 'ban_user'
router.post('/reports/:id/resolve', async (req, res) => {
  const { action, note } = req.body;
  const validActions = ['dismiss', 'warn', 'remove_content', 'suspend_user', 'ban_user'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: 'invalid action' });
  }

  const report = await prisma.report.findUnique({ where: { id: req.params.id } });
  if (!report) return res.status(404).json({ error: 'Report not found' });

  if (action === 'remove_content' && report.targetType === 'video') {
    await prisma.video.update({ where: { id: report.targetId }, data: { status: 'removed' } });
    await logAction(req.userId, 'remove_video', 'video', report.targetId, note);
  }

  if (action === 'suspend_user') {
    const targetUserId = report.targetType === 'user' ? report.targetId : null;
    if (targetUserId) {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { accountStatus: 'suspended', statusReason: note || 'Suspended following a report' },
      });
      await logAction(req.userId, 'suspend_user', 'user', targetUserId, note);
    }
  }

  if (action === 'ban_user') {
    const targetUserId = report.targetType === 'user' ? report.targetId : null;
    if (targetUserId) {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { accountStatus: 'banned', statusReason: note || 'Banned following a report' },
      });
      await logAction(req.userId, 'ban_user', 'user', targetUserId, note);
    }
  }

  const updated = await prisma.report.update({
    where: { id: req.params.id },
    data: {
      status: action === 'dismiss' ? 'dismissed' : 'resolved',
      resolvedById: req.userId,
      resolution: `${action}${note ? `: ${note}` : ''}`,
      resolvedAt: new Date(),
    },
  });

  if (action === 'dismiss') {
    await logAction(req.userId, 'dismiss_report', report.targetType, report.targetId, note);
  } else {
    await logAction(req.userId, 'resolve_report', report.targetType, report.targetId, note);
  }

  res.json(updated);
});

// ---- User account management ----

router.get('/users', async (req, res) => {
  const { search, status } = req.query;
  const users = await prisma.user.findMany({
    where: {
      ...(status ? { accountStatus: status } : {}),
      ...(search
        ? { OR: [{ username: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] }
        : {}),
    },
    select: {
      id: true, username: true, email: true, role: true, accountStatus: true,
      statusReason: true, createdAt: true,
      _count: { select: { videos: true, reportsFiled: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // Count reports filed *against* each user (as opposed to filed *by* them).
  const userIds = users.map((u) => u.id);
  const reportCounts = await prisma.report.groupBy({
    by: ['targetId'],
    where: { targetType: 'user', targetId: { in: userIds } },
    _count: { _all: true },
  });
  const reportsAgainstMap = Object.fromEntries(reportCounts.map((r) => [r.targetId, r._count._all]));

  res.json(users.map((u) => ({ ...u, reportsAgainstCount: reportsAgainstMap[u.id] || 0 })));
});

router.post('/users/:id/suspend', async (req, res) => {
  const { reason } = req.body;
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { accountStatus: 'suspended', statusReason: reason || null },
  });
  await logAction(req.userId, 'suspend_user', 'user', user.id, reason);
  notify({
    userId: user.id,
    type: 'moderation',
    content: `Your account has been suspended.${reason ? ` Reason: ${reason}` : ''}`,
  });
  res.json({ ok: true });
});

// Only full admins can ban (a permanent, high-stakes action) — moderators can suspend.
router.post('/users/:id/ban', requireRole('admin'), async (req, res) => {
  const { reason } = req.body;
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { accountStatus: 'banned', statusReason: reason || null },
  });
  await logAction(req.userId, 'ban_user', 'user', user.id, reason);
  notify({
    userId: user.id,
    type: 'moderation',
    content: `Your account has been banned.${reason ? ` Reason: ${reason}` : ''}`,
  });
  res.json({ ok: true });
});

router.post('/users/:id/reinstate', async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { accountStatus: 'active', statusReason: null },
  });
  await logAction(req.userId, 'reinstate_user', 'user', user.id, null);
  notify({
    userId: user.id,
    type: 'moderation',
    content: 'Your account has been reinstated.',
  });
  res.json({ ok: true });
});

// Only admins can grant/revoke moderator or admin roles.
router.post('/users/:id/role', requireRole('admin'), async (req, res) => {
  const { role } = req.body;
  if (!['user', 'moderator', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'invalid role' });
  }
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { role } });
  await logAction(req.userId, 'change_role', 'user', user.id, `role -> ${role}`);
  res.json({ ok: true });
});

// ---- Video moderation queue ----

router.get('/videos', async (req, res) => {
  const { status = 'published' } = req.query;
  const videos = await prisma.video.findMany({
    where: status === 'all' ? {} : { status },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { user: { select: { id: true, username: true } } },
  });

  const videoIds = videos.map((v) => v.id);
  const reportCounts = await prisma.report.groupBy({
    by: ['targetId'],
    where: { targetType: 'video', targetId: { in: videoIds } },
    _count: { _all: true },
  });
  const reportsMap = Object.fromEntries(reportCounts.map((r) => [r.targetId, r._count._all]));

  res.json(videos.map((v) => ({ ...v, reportsCount: reportsMap[v.id] || 0 })));
});

router.post('/videos/:id/remove', async (req, res) => {
  const { reason } = req.body;
  const video = await prisma.video.update({ where: { id: req.params.id }, data: { status: 'removed' } });
  await logAction(req.userId, 'remove_video', 'video', video.id, reason);
  res.json({ ok: true });
});

// ---- Fraud signals ----
// Lightweight heuristics to help a trust & safety team triage — not a
// verdict, just surfacing accounts worth a closer look.
router.get('/fraud-signals', async (req, res) => {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [mostReportedUsers, rapidTippers, failedTxUsers] = await Promise.all([
    prisma.report.groupBy({
      by: ['targetId'],
      where: { targetType: 'user', createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      _count: { _all: true },
      orderBy: { _count: { targetId: 'desc' } },
      take: 20,
    }),
    prisma.transaction.groupBy({
      by: ['senderId'],
      where: { type: 'tip', createdAt: { gte: dayAgo } },
      _count: { _all: true },
      having: { senderId: { _count: { gt: 10 } } }, // more than 10 tips sent in 24h
      orderBy: { _count: { senderId: 'desc' } },
      take: 20,
    }),
    prisma.transaction.groupBy({
      by: ['senderId'],
      where: { status: 'failed', createdAt: { gte: dayAgo } },
      _count: { _all: true },
      having: { senderId: { _count: { gt: 3 } } }, // repeated failed payments
      orderBy: { _count: { senderId: 'desc' } },
      take: 20,
    }),
  ]);

  const ids = [
    ...mostReportedUsers.map((r) => r.targetId),
    ...rapidTippers.map((r) => r.senderId),
    ...failedTxUsers.map((r) => r.senderId),
  ];
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, username: true, accountStatus: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  res.json({
    mostReported: mostReportedUsers.map((r) => ({ user: userMap[r.targetId], reportCount: r._count._all })),
    rapidTippers: rapidTippers.map((r) => ({ user: userMap[r.senderId], tipCount24h: r._count._all })),
    repeatedFailedPayments: failedTxUsers.map((r) => ({ user: userMap[r.senderId], failedCount24h: r._count._all })),
  });
});

// ---- Audit log ----

router.get('/audit-log', async (req, res) => {
  const actions = await prisma.adminAction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { admin: { select: { id: true, username: true } } },
  });
  res.json(actions);
});

// Confirms the caller has admin/moderator access — the frontend dashboard
// calls this first before rendering anything.
router.get('/me', (req, res) => {
  res.json({ role: req.userRole });
});

// Feeds the top bar's status indicators. "Healthy" vs "Backlogged" is a real
// heuristic off the oldest pending report's age, not a hardcoded label —
// there's no separate incident/SLA system to pull a status from yet.
router.get('/status', async (req, res) => {
  const [pendingCount, oldestPending, moderatorCount] = await Promise.all([
    prisma.report.count({ where: { status: 'pending' } }),
    prisma.report.findFirst({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.user.count({ where: { role: { in: ['admin', 'moderator'] }, accountStatus: 'active' } }),
  ]);

  const oldestPendingMinutes = oldestPending
    ? Math.round((Date.now() - oldestPending.createdAt.getTime()) / 60000)
    : 0;
  const queueStatus = oldestPendingMinutes > 120 ? 'backlogged' : 'healthy';

  res.json({ queueStatus, pendingCount, oldestPendingMinutes, moderatorCount });
});

export default router;
