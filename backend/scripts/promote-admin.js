// One-off script to bootstrap your first admin account, since there's no
// self-serve way to become one (by design).
//
// Usage:
//   node scripts/promote-admin.js someone@example.com admin
//   node scripts/promote-admin.js someone@example.com moderator
import 'dotenv/config';
import prisma from '../src/config/db.js';

const [, , email, roleArg] = process.argv;
const role = roleArg || 'admin';

if (!email || !['admin', 'moderator'].includes(role)) {
  console.error('Usage: node scripts/promote-admin.js <email> <admin|moderator>');
  process.exit(1);
}

const user = await prisma.user.update({ where: { email }, data: { role } });
console.log(`Promoted @${user.username} (${user.email}) to ${role}.`);
process.exit(0);
