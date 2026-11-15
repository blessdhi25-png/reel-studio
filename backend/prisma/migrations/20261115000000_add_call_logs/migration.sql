-- AlterTable
ALTER TABLE "User" ADD COLUMN "callsSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "callId" TEXT,
    "callerId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "callType" TEXT NOT NULL DEFAULT 'VOICE',
    "status" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_callId_key" ON "CallLog"("callId");

-- CreateIndex
CREATE INDEX "CallLog_callerId_createdAt_idx" ON "CallLog"("callerId", "createdAt");

-- CreateIndex
CREATE INDEX "CallLog_receiverId_createdAt_idx" ON "CallLog"("receiverId", "createdAt");

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
