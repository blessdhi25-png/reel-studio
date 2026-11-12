-- AlterTable
ALTER TABLE "Community" ADD COLUMN "inviteCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Community_inviteCode_key" ON "Community"("inviteCode");
