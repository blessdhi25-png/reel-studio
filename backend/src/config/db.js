import { PrismaClient } from '@prisma/client';

// Single shared Prisma instance across the app
const prisma = new PrismaClient();

// Prisma connects lazily on first query by default, so a bad/missing
// DATABASE_URL wouldn't surface until the first request came in. We'd
// rather find out at boot — but Render's initial DB provisioning can be
// briefly unreachable, and a missing env var shouldn't take the whole
// process down. This checks the connection eagerly and logs a clear
// warning on failure instead of throwing, so the server still comes up,
// binds its port, and passes Render's health check; routes that need the
// DB will surface their own errors per-request if it's still down.
export async function connectDB() {
  if (!process.env.DATABASE_URL) {
    console.error('[db] DATABASE_URL is not set — skipping initial connection check.');
    return false;
  }
  try {
    await prisma.$connect();
    console.log('[db] Connected to database.');
    return true;
  } catch (err) {
    console.error('[db] Initial database connection failed:', err.message);
    return false;
  }
}

export default prisma;
