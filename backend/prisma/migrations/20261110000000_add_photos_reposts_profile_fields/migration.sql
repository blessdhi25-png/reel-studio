-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'repost';

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('video', 'photo');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "phone" TEXT,
ADD COLUMN "whatsapp" TEXT,
ADD COLUMN "externalLinks" JSONB;

-- AlterTable
ALTER TABLE "Video" ADD COLUMN "mediaType" "MediaType" NOT NULL DEFAULT 'video',
ADD COLUMN "textOverlays" JSONB;

-- CreateTable
CREATE TABLE "Repost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Repost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Repost_userId_videoId_key" ON "Repost"("userId", "videoId");

-- CreateIndex
CREATE INDEX "Repost_videoId_idx" ON "Repost"("videoId");

-- AddForeignKey
ALTER TABLE "Repost" ADD CONSTRAINT "Repost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repost" ADD CONSTRAINT "Repost_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
