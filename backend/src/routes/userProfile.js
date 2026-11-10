import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { updateAccountSchema } from '../schemas/userProfile.js';
import { sendVerificationCode } from './auth.js';

const router = Router();

const ACCOUNT_SELECT = {
  id: true, username: true, displayName: true, avatarUrl: true, bio: true,
  email: true, emailVerified: true, phone: true, whatsapp: true, externalLinks: true,
  passwordHash: true,
};

function shape(user) {
  const { passwordHash, ...rest } = user;
  return { ...rest, externalLinks: rest.externalLinks || [], hasPassword: !!passwordHash };
}

// The signed-in user's own editable account details (private — includes
// email/phone, which GET /users/:id never exposes).
router.get('/profile', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: ACCOUNT_SELECT });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(shape(user));
}));

// Partial update: only the keys sent are written. '' clears phone/whatsapp/bio.
router.patch('/profile', requireAuth, validate(updateAccountSchema), asyncHandler(async (req, res) => {
  const { email, currentPassword, phone, bio, whatsapp, externalLinks } = req.body;
  const current = await prisma.user.findUnique({ where: { id: req.userId }, select: ACCOUNT_SELECT });
  if (!current) return res.status(404).json({ error: 'User not found' });

  const data = {};
  if (phone !== undefined) data.phone = phone || null;
  if (bio !== undefined) data.bio = bio || null;
  if (whatsapp !== undefined) data.whatsapp = whatsapp || null;
  if (externalLinks !== undefined) data.externalLinks = externalLinks.length ? externalLinks : null;

  let emailChanged = false;
  if (email !== undefined && email !== current.email) {
    // Re-auth for the one field that controls password resets: a stolen
    // session token alone must not be enough to take over the account.
    if (current.passwordHash) {
      if (!currentPassword) return res.status(400).json({ error: 'Enter your current password to change your email' });
      const ok = await bcrypt.compare(currentPassword, current.passwordHash);
      if (!ok) return res.status(403).json({ error: 'Current password is incorrect' });
    }
    const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (taken) return res.status(409).json({ error: 'That email is already in use' });
    data.email = email;
    data.emailVerified = false;
    emailChanged = true;
  }

  if (!Object.keys(data).length) return res.json(shape(current));

  const updated = await prisma.user.update({ where: { id: req.userId }, data, select: ACCOUNT_SELECT });

  let verificationSent = false;
  if (emailChanged) {
    try {
      await sendVerificationCode(updated);
      verificationSent = true;
    } catch (err) {
      console.error('[userProfile] verification email failed:', err.message);
    }
  }
  res.json({ ...shape(updated), emailChanged, verificationSent });
}));

export default router;
