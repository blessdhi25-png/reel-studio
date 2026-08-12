import prisma from '../config/db.js';
import { deleteVideoCascade } from '../utils/deleteVideoCascade.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// AccountStatus/UserRole are stored lowercase in the DB (see the enums in
// prisma/schema.prisma). The spec for these two routes uses uppercase
// values (ACTIVE/SUSPENDED/BANNED, USER/MODERATOR/ADMIN), so both handlers
// below accept either case and normalize before touching the database —
// that's friendlier to callers than silently 400ing on 'ACTIVE'.
const VALID_STATUSES = ['active', 'suspended', 'banned'];
const VALID_ROLES = ['user', 'moderator', 'admin'];

// Reuses the same AdminActionType values the pre-existing suspend/ban/
// reinstate routes already log under (see routes/admin.js) — the audit
// log page's action-color legend is keyed to these exact strings, and
// splitting "set status to X" into a differently-named action type here
// would just fragment the same event across two vocabularies for no
// benefit.
const STATUS_ACTION_TYPE = {
  active: 'reinstate_user',
  suspended: 'suspend_user',
  banned: 'ban_user',
};

async function logAdminAction(adminId, actionType, targetType, targetId, reason) {
  await prisma.adminAction.create({
    data: { adminId, actionType, targetType, targetId, reason: reason || null },
  });
}

// PATCH /admin/users/:id/status — body: { status: 'ACTIVE'|'SUSPENDED'|'BANNED', reason? }
//
// This is the single generic entry point the spec asks for; the existing
// POST /users/:id/suspend, /ban, and /reinstate routes are kept as thin
// wrappers around this same function (see routes/admin.js) rather than
// duplicated logic, so both call shapes always behave identically.
//
// Banned/suspended users are already blocked from logging in (routes/
// auth.js) and from every authenticated action including video upload
// (middleware/auth.js's requireAuth rejects them before a request reaches
// any route handler) — that enforcement already existed and reads
// accountStatus directly, so setting it here via this endpoint is
// sufficient; no separate upload-blocking check was needed.
export const updateUserStatus = asyncHandler(async (req, res) => {
  const status = String(req.body.status || '').toLowerCase().trim();
  const { reason } = req.body;

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` });
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!target) return res.status(404).json({ error: 'User not found' });

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      accountStatus: status,
      // Reinstating clears any prior reason; suspending/banning without
      // one explicitly clears it too, rather than leaving a stale reason
      // from a previous, unrelated suspension attached to the new action.
      statusReason: status === 'active' ? null : reason || null,
    },
  });

  await logAdminAction(req.userId, STATUS_ACTION_TYPE[status], 'user', user.id, reason);
  res.json(user);
});

// PATCH /admin/users/:id/role — body: { role: 'USER'|'MODERATOR'|'ADMIN' }
// Admin-only — enforced by authorizeRoles('admin') on the route itself
// (see routes/admin.js), not here, since a moderator being able to
// self-promote (or promote anyone) to admin would be a privilege-
// escalation hole.
export const updateUserRole = asyncHandler(async (req, res) => {
  const role = String(req.body.role || '').toLowerCase().trim();

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of ${VALID_ROLES.join(', ')}` });
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!target) return res.status(404).json({ error: 'User not found' });

  const user = await prisma.user.update({ where: { id: req.params.id }, data: { role } });
  await logAdminAction(req.userId, 'change_role', 'user', user.id, `role -> ${role}`);
  res.json(user);
});

// DELETE /admin/videos/:id — permanent takedown: destroys the Cloudinary
// assets and hard-deletes the video row (plus its comments/likes/
// bookmarks/feed events — see utils/deleteVideoCascade.js for why those
// have to go first). This is deliberately separate from the pre-existing
// POST /videos/:id/remove "soft remove" (which just flips status to
// 'removed' and keeps everything else intact) — soft-remove is for cases
// where you want the content hidden but preserved as evidence (repeat-
// offender pattern building, appeals); this is for genuine permanent
// takedowns (e.g. DMCA, CSAM) where the content must actually be gone.
export const hardDeleteVideo = asyncHandler(async (req, res) => {
  const video = await prisma.video.findUnique({ where: { id: req.params.id } });
  if (!video) return res.status(404).json({ error: 'Video not found' });

  const { reason } = req.body;
  const { cloudinaryErrors } = await deleteVideoCascade(video);

  await logAdminAction(req.userId, 'delete_video', 'video', video.id, reason);

  res.json({ ok: true, cloudinaryErrors: cloudinaryErrors.length ? cloudinaryErrors : undefined });
});

// GET /admin/audit-log?page=1&limit=50
export const getAuditLog = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

  const [data, total] = await Promise.all([
    prisma.adminAction.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { admin: { select: { id: true, username: true } } },
    }),
    prisma.adminAction.count(),
  ]);

  res.json({ data, page, limit, total, hasMore: page * limit < total });
});
