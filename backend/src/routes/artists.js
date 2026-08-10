import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadTrack } from '../utils/upload.js';

const router = Router();
const LABEL_STATUSES = ['independent', 'signed'];

router.get('/me', requireAuth, async (req, res) => {
  const profile = await prisma.artistProfile.findUnique({ where: { userId: req.userId } });
  if (!profile) return res.status(404).json({ error: 'No artist profile yet' });
  res.json(profile);
});

router.post('/register', requireAuth, async (req, res) => {
  const { stageName, genre, spotifyUrl, appleMusicUrl, youtubeUrl, managementEmail, labelStatus } = req.body;

  if (!stageName?.trim() || !genre?.trim()) {
    return res.status(400).json({ error: 'Artist/stage name and primary genre are required' });
  }
  if (!LABEL_STATUSES.includes(labelStatus)) {
    return res.status(400).json({ error: 'labelStatus must be "independent" or "signed"' });
  }

  const existing = await prisma.artistProfile.findUnique({ where: { userId: req.userId } });
  if (existing) return res.status(409).json({ error: 'You already have an artist profile' });

  const profile = await prisma.artistProfile.create({
    data: {
      userId: req.userId,
      stageName: stageName.trim(),
      genre: genre.trim(),
      spotifyUrl: spotifyUrl?.trim() || null,
      appleMusicUrl: appleMusicUrl?.trim() || null,
      youtubeUrl: youtubeUrl?.trim() || null,
      managementEmail: managementEmail?.trim() || null,
      labelStatus,
    },
  });

  res.status(201).json(profile);
});

// Every track's analytics, computed live rather than stored as stale
// counters — "uses" is a straight count of videos pointing at the track,
// and "tips earned" sums real completed tip transactions on those videos.
// That second number is informational only: tips still pay out to whichever
// creator posted the video, not automatically to the artist — there's no
// revenue-split/payout pipeline for that yet, so we label it accordingly
// in the response rather than implying artists are actually being paid it.
router.get('/me/tracks', requireAuth, async (req, res) => {
  const profile = await prisma.artistProfile.findUnique({ where: { userId: req.userId } });
  if (!profile) return res.status(404).json({ error: 'No artist profile yet' });

  const tracks = await prisma.track.findMany({
    where: { artistId: profile.id },
    orderBy: { createdAt: 'desc' },
    include: { videos: { select: { id: true } } },
  });

  const enriched = await Promise.all(
    tracks.map(async (t) => {
      const videoIds = t.videos.map((v) => v.id);
      const tipSum = videoIds.length
        ? await prisma.transaction.aggregate({
            where: { videoId: { in: videoIds }, type: 'tip', status: 'completed' },
            _sum: { amountCents: true },
          })
        : { _sum: { amountCents: 0 } };
      return {
        id: t.id,
        title: t.title,
        audioUrl: t.audioUrl,
        durationSeconds: t.durationSeconds,
        createdAt: t.createdAt,
        useCount: t.videos.length,
        tipsOnReelsUsingTrackCents: tipSum._sum.amountCents || 0,
      };
    })
  );

  res.json(enriched);
});

router.post('/me/tracks', requireAuth, uploadTrack.single('audio'), async (req, res) => {
  const profile = await prisma.artistProfile.findUnique({ where: { userId: req.userId } });
  if (!profile) return res.status(404).json({ error: 'Register as an artist first' });
  if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });
  if (!req.body.title?.trim()) return res.status(400).json({ error: 'Track title is required' });

  const track = await prisma.track.create({
    data: {
      artistId: profile.id,
      title: req.body.title.trim(),
      audioUrl: req.file.path, // Cloudinary secure CDN URL — see utils/upload.js
      durationSeconds: req.body.durationSeconds ? Number(req.body.durationSeconds) : null,
    },
  });

  res.status(201).json(track);
});

// Lets any creator browse distributed tracks to attach to a new post —
// this is the actual "for other creators to use in their reels" mechanism.
router.get('/tracks/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  const tracks = await prisma.track.findMany({
    where: q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { artist: { stageName: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {},
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { artist: { select: { stageName: true } } },
  });
  res.json(tracks.map((t) => ({ id: t.id, title: t.title, audioUrl: t.audioUrl, artistName: t.artist.stageName })));
});

export default router;
