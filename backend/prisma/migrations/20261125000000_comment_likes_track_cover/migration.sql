-- Album/cover art for distributed tracks (shown on the feed's spinning disc and /sound/[id]).
ALTER TABLE "Track" ADD COLUMN "coverUrl" TEXT;

-- Per-comment likes (the heart + count in the comment sheet). Comment.likeCount already existed.
CREATE TABLE "CommentLike" (
    "userId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommentLike_pkey" PRIMARY KEY ("userId","commentId")
);
CREATE INDEX "CommentLike_commentId_idx" ON "CommentLike"("commentId");
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
