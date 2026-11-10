import { z } from 'zod';

// Empty string = "clear this field" (stored as null); omitted = leave alone.
const optionalText = (max, label) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer`).optional();

const httpUrl = z.string().trim().max(300).url('Must be a valid URL').refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL');

export const updateAccountSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254).optional(),
  // Required by the route only when the email is actually changing and the
  // account has a password (Google-only accounts have none).
  currentPassword: z.string().max(200).optional(),
  phone: z
    .string().trim()
    .refine((v) => v === '' || /^\+?[0-9 ()\-]{7,20}$/.test(v), 'Enter a valid phone number')
    .optional(),
  bio: optionalText(150, 'Bio'),
  // A number (WhatsApp click-to-chat) or a wa.me / chat link.
  whatsapp: z
    .string().trim().max(200)
    .refine((v) => v === '' || /^\+?[0-9 ()\-]{7,20}$/.test(v) || /^https?:\/\/(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\//i.test(v), 'Enter a phone number or a wa.me link')
    .optional(),
  externalLinks: z
    .array(z.object({ label: z.string().trim().min(1, 'Link label is required').max(30), url: httpUrl }))
    .max(5, 'You can add up to 5 links')
    .optional(),
});
