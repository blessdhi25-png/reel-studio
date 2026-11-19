import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Support tickets (Settings → Help Centre → Support tickets).
// People create and follow their own tickets; moderators/admins can see every ticket, reply and set the status.
const router = Router();

const CATEGORIES = ['account', 'posts', 'live', 'monetisation', 'safety', 'technical', 'other'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const MAX_OPEN_TICKETS = 5;
const isStaff = (req) => req.userRole === 'admin' || req.userRole === 'moderator';

const AUTHOR = { select: { id: true, username: true } };
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function loadTicket(req, res) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: req.params.id },
    include: {
      user: AUTHOR,
      replies: { orderBy: { createdAt: 'asc' }, include: { author: AUTHOR } },
    },
  });
  // Same 404 for "doesn't exist" and "not yours" so ids can't be probed.
  if (!ticket || (ticket.userId !== req.userId && !isStaff(req))) {
    res.status(404).json({ error: 'Ticket not found' });
    return null;
  }
  return ticket;
}

// GET /support/tickets[?scope=all]   mine (newest activity first); staff may pass scope=all
router.get('/tickets', requireAuth, asyncHandler(async (req, res) => {
  const all = req.query.scope === 'all';
  if (all && !isStaff(req)) return res.status(403).json({ error: 'Insufficient permissions' });
  const status = STATUSES.includes(req.query.status) ? req.query.status : undefined;
  const tickets = await prisma.supportTicket.findMany({
    where: { ...(all ? {} : { userId: req.userId }), ...(status ? { status } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: {
      id: true, subject: true, category: true, status: true, createdAt: true, updatedAt: true,
      user: AUTHOR,
      _count: { select: { replies: true } },
    },
  });
  res.json({ tickets });
}));

// POST /support/tickets { subject, category, message }
router.post('/tickets', requireAuth, asyncHandler(async (req, res) => {
  const subject = clean(req.body?.subject, 120);
  const message = clean(req.body?.message, 4000);
  const category = CATEGORIES.includes(req.body?.category) ? req.body.category : 'other';
  if (subject.length < 3) return res.status(400).json({ error: 'Please add a short subject (at least 3 characters).' });
  if (message.length < 10) return res.status(400).json({ error: 'Please describe the problem in a bit more detail.' });

  const open = await prisma.supportTicket.count({ where: { userId: req.userId, status: { in: ['open', 'in_progress'] } } });
  if (open >= MAX_OPEN_TICKETS) {
    return res.status(429).json({ error: 'You already have several open tickets. Please wait for a reply or close one first.' });
  }
  const ticket = await prisma.supportTicket.create({
    data: {
      userId: req.userId,
      subject,
      category,
      replies: { create: { authorId: req.userId, isStaff: false, message } },
    },
    select: { id: true, subject: true, category: true, status: true, createdAt: true, updatedAt: true },
  });
  res.status(201).json(ticket);
}));

// GET /support/tickets/:id
router.get('/tickets/:id', requireAuth, asyncHandler(async (req, res) => {
  const ticket = await loadTicket(req, res);
  if (ticket) res.json(ticket);
}));

// POST /support/tickets/:id/replies { message }
router.post('/tickets/:id/replies', requireAuth, asyncHandler(async (req, res) => {
  const ticket = await loadTicket(req, res);
  if (!ticket) return;
  const message = clean(req.body?.message, 4000);
  if (!message) return res.status(400).json({ error: 'Write a message first.' });
  if (ticket.status === 'closed') return res.status(400).json({ error: 'This ticket is closed. Please open a new one.' });

  const staff = isStaff(req) && ticket.userId !== req.userId;
  // A staff reply moves an untouched ticket along; the owner replying to a resolved one reopens it.
  const status = staff ? (ticket.status === 'open' ? 'in_progress' : ticket.status) : (ticket.status === 'resolved' ? 'open' : ticket.status);
  const reply = await prisma.$transaction(async (tx) => {
    const r = await tx.supportTicketReply.create({
      data: { ticketId: ticket.id, authorId: req.userId, isStaff: staff, message },
      include: { author: AUTHOR },
    });
    await tx.supportTicket.update({ where: { id: ticket.id }, data: { status } });
    return r;
  });
  if (staff) {
    prisma.notification
      .create({ data: { userId: ticket.userId, actorId: req.userId, type: 'system', content: `Support replied to “${ticket.subject}”`, targetType: 'support_ticket', targetId: ticket.id } })
      .catch(() => {});
  }
  res.status(201).json({ reply, status });
}));

// PATCH /support/tickets/:id { status }   staff set any status; the owner may only close their own ticket
router.patch('/tickets/:id', requireAuth, asyncHandler(async (req, res) => {
  const ticket = await loadTicket(req, res);
  if (!ticket) return;
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  if (!isStaff(req) && status !== 'closed') return res.status(403).json({ error: 'Insufficient permissions' });
  const updated = await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status }, select: { id: true, status: true, updatedAt: true } });
  res.json(updated);
}));

export default router;
