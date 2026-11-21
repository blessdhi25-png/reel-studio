-- Linked Facebook account on the user record.
ALTER TABLE "User" ADD COLUMN "facebookId" TEXT;
ALTER TABLE "User" ADD COLUMN "facebookName" TEXT;
ALTER TABLE "User" ADD COLUMN "facebookLinkedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "facebookSyncedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_facebookId_key" ON "User"("facebookId");

-- Web Push subscriptions (one per device/browser).
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
