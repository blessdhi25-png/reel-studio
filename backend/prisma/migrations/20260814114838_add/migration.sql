/*
  Warnings:

  - You are about to drop the column `createdById` on the `Collection` table. All the data in the column will be lost.
  - You are about to drop the `CollectionItem` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `ownerId` to the `Collection` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Collection" DROP CONSTRAINT "Collection_createdById_fkey";

-- DropForeignKey
ALTER TABLE "CollectionItem" DROP CONSTRAINT "CollectionItem_addedById_fkey";

-- DropForeignKey
ALTER TABLE "CollectionItem" DROP CONSTRAINT "CollectionItem_collectionId_fkey";

-- DropForeignKey
ALTER TABLE "CollectionItem" DROP CONSTRAINT "CollectionItem_videoId_fkey";

-- DropIndex
DROP INDEX "Collection_createdById_idx";

-- DropIndex
DROP INDEX "Collection_privacy_idx";

-- DropIndex
DROP INDEX "CollectionCollaborator_userId_idx";

-- AlterTable
ALTER TABLE "Collection" DROP COLUMN "createdById",
ADD COLUMN     "ownerId" TEXT NOT NULL;

-- DropTable
DROP TABLE "CollectionItem";

-- CreateTable
CREATE TABLE "CollectionVideo" (
    "collectionId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionVideo_pkey" PRIMARY KEY ("collectionId","videoId")
);

-- CreateIndex
CREATE INDEX "Collection_ownerId_idx" ON "Collection"("ownerId");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionVideo" ADD CONSTRAINT "CollectionVideo_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionVideo" ADD CONSTRAINT "CollectionVideo_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionVideo" ADD CONSTRAINT "CollectionVideo_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
