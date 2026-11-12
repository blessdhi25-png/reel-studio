import { Router } from 'express';
import prisma from '../config/db.js';
import { authenticateUser, authorizeRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Staff moderation API — shared by the moderator portal (/moderator) and the
// admin dashboard (/admin). Open to moderators AND admins; the rest of
// /admin/* stays admin-only. Everything a moderator can do here is limited to
// content actions: dismiss reports, soft-remove a video, ban a regular user.
// Role changes, hard deletes and the audit log stay admin-only.
const router = Router();
router.use(authenticateUser, authorizeRoles('moderator', 'admin'));

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

async function audit(adminId, actionType, targetType, targetId, reason) {
  await prisma.adminAction.create({ data: { adminId, actionType, targetType, targetId, reason: reason || null } });
}

router.get('/stats', asyncHandler(async (req, res) => {
  const today = startOfToday();
  const [pendingReports, pendingVideoGroups, resolvedByMeToday, removedToday, bannedUsers] = await Promise.all([
    prisma.report.count({ where: { status: 'pending' } }),
    prisma.report.groupBy({ by: ['targetId'], where: { status: 'pending', targetType: 'video' } }),
    prisma.report.count({ where: { resolvedById: req.userId, resolvedAt: { gte: today } } }),
    prisma.adminAction.count({ where: { actionType: 'remove_video', createdAt: { gte: today } } }),
    prisma.user.count({ where: { accountStatus: 'banned' } }),
  ]);
  res.json({
    pendingReports,
    flaggedVideos: pendingVideoGroups.length,
    resolvedByMeToday,
    removedToday,
    bannedUsers,
  });
}));

// Flagged-video review queue: pending video reports grouped per video, most
// reported first.
router.get('/queue', asyncHandler(async (req, res) => {
  const reports = await prisma.report.findMany({
    where: { status: 'pending', targetType: 'video' },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, targetId: true, reason: true, details: true, createdAt: true },
  });

  const groups = new Map();
  for (const r of reports) {
    let g = groups.get(r.targetId);
    if (!g) {
      g = { videoId: r.targetId, reportCount: 0, reasons: {}, latestAt: r.createdAt, latestDetails: null };
      groups.set(r.targetId, g);
    }
    g.reportCount += 1;
    g.reasons[r.reason] = (g.reasons[r.reason] || 0) + 1;
    if (!g.latestDetails && r.details) g.latestDetails = r.details.slice(0, 280);
  }

  const ids = [...groups.keys()];
  const videos = ids.length
    ? await prisma.video.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, caption: true, thumbnailUrl: true, videoUrl: true, mediaType: true, status: true, createdAt: true,
          user: { select: { id: true, username: true, avatarUrl: true, role: true, accountStatus: true } },
        },
      })
    : [];
  const byId = new Map(videos.map((v) => [v.id, v]));

  const items = [...groups.values()]
    .map((g) => ({ ...g, video: byId.get(g.videoId) || null }))
    .sort((a, b) => b.reportCount - a.reportCount || new Date(b.latestAt) - new Date(a.latestAt));
  res.json(items.slice(0, 100));
}));

// Approve = the video is fine: dismiss every pending report against it.
router.post('/videos/:id/approve', asyncHandler(async (req, res) => {
  const result = await prisma.report.updateMany({
    where: { targetType: 'video', targetId: req.params.id, status: 'pending' },
    data: { status: 'dismissed', resolution: 'Reviewed — content approved', resolvedById: req.userId, resolvedAt: new Date() },
  });
  if (result.count > 0) await audit(req.userId, 'dismiss_report', 'video', req.params.id, 'Content approved');
  res.json({ ok: true, dismissed: result.count });
}));

// Delete = soft remove (hidden everywhere, row kept as evidence) and resolve
// its reports. Permanent deletion stays an admin-only action.
router.post('/videos/:id/remove', asyncHandler(async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : null;
  const video = await prisma.video.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!video) return res.status(404).json({ error: 'Video not found' });
  await prisma.$transaction([
    prisma.video.update({ where: { id: video.id }, data: { status: 'removed' } }),
    prisma.report.updateMany({
      where: { targetType: 'video', targetId: video.id, status: 'pending' },
      data: { status: 'resolved', resolution: 'Video removed', resolvedById: req.userId, resolvedAt: new Date() },
    }),
  ]);
  await audit(req.userId, 'remove_video', 'video', video.id, reason);
  res.json({ ok: true });
}));

// Ban a user (e.g. the author of a flagged video). Moderators can only ban
// regular users; admins can additionally ban moderators. Nobody can ban an
// admin or themselves through this route.
router.post('/users/:id/ban', asyncHandler(async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : null;
  if (req.params.id === req.userId) return res.status(400).json({ error: "You can't ban yourself" });
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true, accountStatus: true } });
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'admin') return res.status(403).json({ error: "Admin accounts can't be banned" });
  if (target.role === 'moderator' && req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Only admins can ban moderators' });
  }
  if (target.accountStatus === 'banned') return res.json({ ok: true, alreadyBanned: true });
  await prisma.user.update({ where: { id: target.id }, data: { accountStatus: 'banned', statusReason: reason } });
  await audit(req.userId, 'ban_user', 'user', target.id, reason);
  res.json({ ok: true });
}));

export default router;
