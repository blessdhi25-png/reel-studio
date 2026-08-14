/*
  Warnings:

  - You are about to drop the column `ownerId` on the `Collection` table. All the data in the column will be lost.
  - The `privacy` column on the `Collection` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `createdAt` on the `CollectionItem` table. All the data in the column will be lost.
  - Added the required column `createdById` to the `Collection` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Collection" DROP CONSTRAINT "Collection_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "CollectionCollaborator" DROP CONSTRAINT "CollectionCollaborator_collectionId_fkey";

-- DropForeignKey
ALTER TABLE "CollectionItem" DROP CONSTRAINT "CollectionItem_collectionId_fkey";

-- DropForeignKey
ALTER TABLE "CollectionItem" DROP CONSTRAINT "CollectionItem_videoId_fkey";

-- DropIndex
DROP INDEX "Collection_ownerId_idx";

-- AlterTable
ALTER TABLE "Collection" DROP COLUMN "ownerId",
ADD COLUMN     "createdById" TEXT NOT NULL,
DROP COLUMN "privacy",
ADD COLUMN     "privacy" TEXT NOT NULL DEFAULT 'private';

-- AlterTable
ALTER TABLE "CollectionItem" DROP COLUMN "createdAt",
ADD COLUMN     "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropEnum
DROP TYPE "CollectionPrivacy";

-- CreateIndex
CREATE INDEX "Collection_createdById_idx" ON "Collection"("createdById");

-- CreateIndex
CREATE INDEX "Collection_privacy_idx" ON "Collection"("privacy");

-- CreateIndex
CREATE INDEX "CollectionCollaborator_userId_idx" ON "CollectionCollaborator"("userId");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionCollaborator" ADD CONSTRAINT "CollectionCollaborator_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
