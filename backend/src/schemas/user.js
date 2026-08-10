import { z } from 'zod';

// A reasonably strict "is this a real http(s) URL" check — avatarUrl/
// bannerUrl are set by our own upload endpoints in normal use (see
// routes/users.js), but PATCH /users/me also accepts them directly as
// plain strings, so this is what stands between that field and something
// like a javascript: URL or an arbitrary string ending up stored and later
// rendered in an <img src>.
const httpUrl = () => z.string().trim().url('Must be a valid URL').startsWith('http', 'Must be an http(s) URL');

// PATCH /users/me is a partial update — the frontend sends only the fields
// actually being changed — so every field here is optional rather than
// required. Prisma only writes keys present in the parsed result, so a
// field omitted from the request body stays omitted after validation too
// (not overwritten with null/undefined).
export const updateProfileSchema = z.object({
  displayName: z.string().trim().max(60, 'Display name must be 60 characters or fewer').optional(),
  bio: z.string().trim().max(150, 'Bio must be 150 characters or fewer').optional(),
  avatarUrl: httpUrl().optional(),
  bannerUrl: httpUrl().optional(),
});
