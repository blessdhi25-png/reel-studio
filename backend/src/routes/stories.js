import { Router } from 'express';
import prisma from '../config/db.js';
import cloudinary from '../config/cloudinary.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadStoryMedia, cloudinaryPublicIdFromUrl } from '../utils/upload.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;
const DEFAULT_VIDEO_DURATION_SECONDS = 15; // used only if the client didn't report the real duration

function parsePollOptions(raw) {
  if (!raw) return null;
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length < 2 || parsed.length > 4) return null;
  return parsed.map((label, i) => ({ id: String(i), label: String(label).slice(0, 40) }));
}

// POST /stories — create a story. multipart for image/video (field name
// "media"), plain JSON body for a text-only story (mediaType: 'text').
router.post(
  '/stories',
  requireAuth,
  uploadStoryMedia.single('media'),
  asyncHandler(async (req, res) => {
    const { mediaType, textContent, backgroundColor, linkUrl, linkLabel, pollQuestion, pollOptions, qaQuestion, durationSeconds } = req.body;

    if (!['image', 'video', 'text'].includes(mediaType)) {
      return res.status(400).json({ error: 'mediaType must be image, video, or text' });
    }
    if (mediaType === 'text' && !textContent?.trim()) {
      return res.status(400).json({ error: 'textContent is required for a text story' });
    }
    if (mediaType !== 'text' && !req.file) {
      return res.status(400).json({ error: 'media file is required' });
    }

    const parsedPollOptions = parsePollOptions(pollOptions);

    const story = await prisma.story.create({
      data: {
        userId: req.userId,
        mediaType,
        mediaUrl: req.file?.path || null,
        durationSeconds:
          mediaType === 'video'
            ? Number(durationSeconds) > 0 && Number(durationSeconds) < 120
              ? Number(durationSeconds)
              : DEFAULT_VIDEO_DURATION_SECONDS
            : null,
        textContent: mediaType === 'text' ? textContent.trim().slice(0, 280) : null,
        backgroundColor: backgroundColor ? String(backgroundColor).slice(0, 20) : null,
        linkUrl: linkUrl ? String(linkUrl).slice(0, 500) : null,
        linkLabel: linkLabel ? String(linkLabel).slice(0, 40) : null,
        pollQuestion: parsedPollOptions && pollQuestion ? String(pollQuestion).slice(0, 120) : null,
        pollOptions: parsedPollOptions && pollQuestion ? parsedPollOptions : undefined,
        qaQuestion: qaQuestion ? String(qaQuestion).slice(0, 120) : null,
        expiresAt: new Date(Date.now() + STORY_LIFETIME_MS),
      },
    });

    res.status(201).json(story);
  })
);

// GET /stories/feed — active (non-expired) stories from the signed-in user
// and everyone they follow, grouped by author. Own stories always come
// first; everyone else is sorted unviewed-first, matching the standard
// Instagram/Snapchat convention this component is modeled on.
router.get(
  '/stories/feed',
  requireAuth,
  asyncHandler(async (req, res) => {
    const follows = await prisma.follow.findMany({
      where: { followerId: req.userId },
      select: { followeeId: true },
    });
    const authorIds = [req.userId, ...follows.map((f) => f.followeeId)];

    const stories = await prisma.story.findMany({
      where: { userId: { in: authorIds }, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
        _count: { select: { likes: true, views: true } },
      },
    });

    if (stories.length === 0) return res.json([]);

    const storyIds = stories.map((s) => s.id);

    const [myViews, myLikes, myInteractions, pollTallies] = await Promise.all([
      prisma.storyView.findMany({ where: { storyId: { in: storyIds }, viewerId: req.userId }, select: { storyId: true } }),
      prisma.storyLike.findMany({ where: { storyId: { in: storyIds }, userId: req.userId }, select: { storyId: true } }),
      prisma.storyInteraction.findMany({
        where: { storyId: { in: storyIds }, userId: req.userId },
        select: { storyId: true, type: true, value: true },
      }),
      prisma.storyInteraction.groupBy({
        by: ['storyId', 'value'],
        where: { storyId: { in: storyIds }, type: 'poll_vote' },
        _count: true,
      }),
    ]);

    const viewedSet = new Set(myViews.map((v) => v.storyId));
    const likedSet = new Set(myLikes.map((l) => l.storyId));
    const myVoteByStory = new Map(myInteractions.filter((i) => i.type === 'poll_vote').map((i) => [i.storyId, i.value]));
    const myAnswerByStory = new Map(myInteractions.filter((i) => i.type === 'qa_response').map((i) => [i.storyId, i.value]));
    const talliesByStory = new Map();
    for (const t of pollTallies) {
      if (!talliesByStory.has(t.storyId)) talliesByStory.set(t.storyId, {});
      talliesByStory.get(t.storyId)[t.value] = t._count;
    }

    const grouped = new Map();
    for (const s of stories) {
      const key = s.userId;
      if (!grouped.has(key)) grouped.set(key, { user: s.user, hasUnviewed: false, stories: [] });
      const viewed = viewedSet.has(s.id);
      if (!viewed && key !== req.userId) grouped.get(key).hasUnviewed = true;

      const tallies = talliesByStory.get(s.id) || {};
      const pollOptions = Array.isArray(s.pollOptions)
        ? s.pollOptions.map((o) => ({ ...o, votes: tallies[o.id] || 0 }))
        : null;

      grouped.get(key).stories.push({
        id: s.id,
        mediaType: s.mediaType,
        mediaUrl: s.mediaUrl,
        durationSeconds: s.durationSeconds,
        textContent: s.textContent,
        backgroundColor: s.backgroundColor,
        linkUrl: s.linkUrl,
        linkLabel: s.linkLabel,
        pollQuestion: s.pollQuestion,
        pollOptions,
        myPollVote: myVoteByStory.get(s.id) || null,
        qaQuestion: s.qaQuestion,
        myQaResponse: myAnswerByStory.get(s.id) || null,
        createdAt: s.createdAt,
        viewed,
        likeCount: s._count.likes,
        likedByMe: likedSet.has(s.id),
        viewCount: s._count.views,
      });
    }

    // Own stories first, then unviewed authors, then already-fully-viewed
    // authors — each bucket ordered by most recent story.
    const result = [...grouped.values()].sort((a, b) => {
      if (a.user.id === req.userId) return -1;
      if (b.user.id === req.userId) return 1;
      if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1;
      return new Date(b.stories.at(-1).createdAt) - new Date(a.stories.at(-1).createdAt);
    });

    res.json(result);
  })
);

router.post(
  '/stories/:id/view',
  requireAuth,
  asyncHandler(async (req, res) => {
    // upsert rather than create — repeat views (reopening a story) are the
    // common case and should just no-op, not throw on the unique constraint.
    await prisma.storyView.upsert({
      where: { storyId_viewerId: { storyId: req.params.id, viewerId: req.userId } },
      create: { storyId: req.params.id, viewerId: req.userId },
      update: {},
    });
    res.json({ ok: true });
  })
);

router.post(
  '/stories/:id/like',
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.storyLike.upsert({
      where: { storyId_userId: { storyId: req.params.id, userId: req.userId } },
      create: { storyId: req.params.id, userId: req.userId },
      update: {},
    });
    const likeCount = await prisma.storyLike.count({ where: { storyId: req.params.id } });
    res.json({ liked: true, likeCount });
  })
);

router.delete(
  '/stories/:id/like',
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.storyLike.deleteMany({ where: { storyId: req.params.id, userId: req.userId } });
    const likeCount = await prisma.storyLike.count({ where: { storyId: req.params.id } });
    res.json({ liked: false, likeCount });
  })
);

router.post(
  '/stories/:id/poll-vote',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { optionId } = req.body;
    if (!optionId) return res.status(400).json({ error: 'optionId is required' });

    const story = await prisma.story.findUnique({ where: { id: req.params.id }, select: { pollOptions: true } });
    if (!story?.pollOptions || !story.pollOptions.some((o) => o.id === optionId)) {
      return res.status(400).json({ error: 'Not a valid option for this poll' });
    }

    await prisma.storyInteraction.upsert({
      where: { storyId_userId_type: { storyId: req.params.id, userId: req.userId, type: 'poll_vote' } },
      create: { storyId: req.params.id, userId: req.userId, type: 'poll_vote', value: optionId },
      update: { value: optionId },
    });

    const tallies = await prisma.storyInteraction.groupBy({
      by: ['value'],
      where: { storyId: req.params.id, type: 'poll_vote' },
      _count: true,
    });
    const pollOptions = story.pollOptions.map((o) => ({
      ...o,
      votes: tallies.find((t) => t.value === o.id)?._count || 0,
    }));
    res.json({ myPollVote: optionId, pollOptions });
  })
);

router.post(
  '/stories/:id/qa-response',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { answer } = req.body;
    if (!answer?.trim()) return res.status(400).json({ error: 'answer is required' });

    await prisma.storyInteraction.upsert({
      where: { storyId_userId_type: { storyId: req.params.id, userId: req.userId, type: 'qa_response' } },
      create: { storyId: req.params.id, userId: req.userId, type: 'qa_response', value: answer.trim().slice(0, 200) },
      update: { value: answer.trim().slice(0, 200) },
    });
    res.json({ ok: true });
  })
);

// Story authors only get to see raw Q&A answers people left them — not
// exposed on the public feed payload, same principle as it being a DM-like
// reply rather than a public comment.
router.get(
  '/stories/:id/qa-responses',
  requireAuth,
  asyncHandler(async (req, res) => {
    const story = await prisma.story.findUnique({ where: { id: req.params.id }, select: { userId: true } });
    if (!story) return res.status(404).json({ error: 'Story not found' });
    if (story.userId !== req.userId) return res.status(403).json({ error: 'Not your story' });

    const responses = await prisma.storyInteraction.findMany({
      where: { storyId: req.params.id, type: 'qa_response' },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(responses.map((r) => ({ id: r.id, answer: r.value, user: r.user, createdAt: r.createdAt })));
  })
);

router.delete(
  '/stories/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const story = await prisma.story.findUnique({ where: { id: req.params.id } });
    if (!story) return res.status(404).json({ error: 'Story not found' });
    if (story.userId !== req.userId) return res.status(403).json({ error: 'Not your story' });

    // Best-effort, same reasoning as deleteVideoCascade — never blocks the
    // actual delete if Cloudinary cleanup fails.
    const publicId = cloudinaryPublicIdFromUrl(story.mediaUrl);
    if (publicId) {
      cloudinary.uploader.destroy(publicId, { resource_type: story.mediaType === 'video' ? 'video' : 'image' }).catch((err) => {
        console.error(`[stories] Cloudinary cleanup failed for story ${story.id}:`, err.message);
      });
    }

    // StoryView/StoryLike/StoryInteraction all cascade on Story delete
    // (see schema.prisma) — no manual cleanup needed here.
    await prisma.story.delete({ where: { id: story.id } });
    res.json({ ok: true });
  })
);

export default router;
