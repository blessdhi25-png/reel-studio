-- AlterTable
ALTER TABLE "User" ADD COLUMN "aiCredits" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "AiTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "previewUrl" TEXT NOT NULL,
    "modelEndpoint" TEXT NOT NULL,
    "creditsCost" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "soundTitle" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AiTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiTemplate_category_isActive_idx" ON "AiTemplate"("category", "isActive");
