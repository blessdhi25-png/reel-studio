-- Support tickets: spec'd column names, device/location capture, staff note, UPPERCASE statuses.
ALTER TABLE "SupportTicket" RENAME COLUMN "subject" TO "title";
ALTER TABLE "SupportTicket" RENAME COLUMN "category" TO "issueType";
ALTER TABLE "SupportTicket" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SupportTicket" ADD COLUMN "deviceInfo" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "locationText" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "adminNote" TEXT;

-- The opening message used to be the first reply; it now lives in "description".
UPDATE "SupportTicket" t SET "description" = COALESCE(
  (SELECT r."message" FROM "SupportTicketReply" r WHERE r."ticketId" = t."id" ORDER BY r."createdAt" ASC LIMIT 1), '');
DELETE FROM "SupportTicketReply"
WHERE "id" IN (SELECT DISTINCT ON ("ticketId") "id" FROM "SupportTicketReply" ORDER BY "ticketId", "createdAt" ASC)
  AND "isStaff" = false;

UPDATE "SupportTicket" SET "status" = CASE "status"
  WHEN 'open' THEN 'OPEN' WHEN 'in_progress' THEN 'IN_REVIEW' WHEN 'resolved' THEN 'RESOLVED' WHEN 'closed' THEN 'CLOSED'
  ELSE 'OPEN' END;
ALTER TABLE "SupportTicket" ALTER COLUMN "status" SET DEFAULT 'OPEN';
ALTER TABLE "SupportTicket" ALTER COLUMN "description" DROP DEFAULT;

-- "Sign out of all other devices"
ALTER TABLE "User" ADD COLUMN "sessionsRevokedAt" TIMESTAMP(3);

-- Contact sync (hashed)
CREATE TABLE "SyncedContact" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'contacts',
  "hash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SyncedContact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SyncedContact_userId_hash_key" ON "SyncedContact"("userId", "hash");
CREATE INDEX "SyncedContact_userId_source_idx" ON "SyncedContact"("userId", "source");
ALTER TABLE "SyncedContact" ADD CONSTRAINT "SyncedContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
