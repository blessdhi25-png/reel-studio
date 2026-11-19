-- Video language (feed ranking) + cached translations.
ALTER TABLE "Video" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
CREATE INDEX "Video_language_rankingScore_idx" ON "Video"("language", "rankingScore");

CREATE TABLE "TranslationCache" (
  "id" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "targetLang" TEXT NOT NULL,
  "sourceLang" TEXT,
  "translated" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TranslationCache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TranslationCache_hash_targetLang_key" ON "TranslationCache"("hash", "targetLang");
