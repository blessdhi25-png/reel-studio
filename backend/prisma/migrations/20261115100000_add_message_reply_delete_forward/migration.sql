-- AlterTable
ALTER TABLE "Message" ADD COLUMN "replyToId" TEXT,
ADD COLUMN "forwarded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deletedBySender" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deletedByReceiver" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deletedForAll" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Message_replyToId_idx" ON "Message"("replyToId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
