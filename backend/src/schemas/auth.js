import { z } from 'zod';

// Shared building blocks — kept as functions so each schema below controls
// its own field-specific error message rather than a generic reused one.
// Deliberately NOT lowercasing here. Adding that would make login/register/
// forgot-password start normalizing case for the first time — but every
// existing account's email in the database was stored with whatever
// casing the user originally typed, and Prisma's findUnique() on email is
// an exact, case-sensitive match. Normalizing only on the way in (without
// a corresponding one-time migration to lowercase existing rows) would
// lock out any existing user whose stored email has any uppercase
// character. Kept case-sensitive to match prior behavior exactly.
const email = () => z.string().trim().email('Enter a valid email address');
const password = (label = 'Password') =>
  z.string().min(8, `${label} must be at least 8 characters`);
const username = () =>
  z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be 30 characters or fewer')
    .regex(/^[a-zA-Z0-9_.]+$/, 'Username can only contain letters, numbers, "." and "_"');

export const registerSchema = z.object({
  username: username(),
  email: email(),
  password: password(),
  displayName: z.string().trim().max(60, 'Display name must be 60 characters or fewer').optional(),
});

export const loginSchema = z.object({
  email: email(),
  // Deliberately NOT re-validating a minimum length here — a login attempt
  // with a too-short password should still fail as "invalid credentials"
  // from the real bcrypt.compare() check, not surface a schema error that
  // would let an attacker distinguish "wrong length" from "wrong password"
  // before ever touching the database.
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'token is required'),
  newPassword: password('New password'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: password('New password'),
    // Optional here (the route itself also treats it as optional) — when
    // present it's cross-checked against newPassword below.
    confirmPassword: z.string().optional(),
  })
  .refine((data) => data.confirmPassword === undefined || data.confirmPassword === data.newPassword, {
    message: 'New passwords do not match',
    path: ['confirmPassword'],
  });
