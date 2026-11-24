import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadTrack } from '../utils/upload.js';
import cloudinary from '../config/cloudinary.js';

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
        coverUrl: t.coverUrl,
        durationSeconds: t.durationSeconds,
        createdAt: t.createdAt,
        useCount: t.videos.length,
        tipsOnReelsUsingTrackCents: tipSum._sum.amountCents || 0,
      };
    })
  );

  res.json(enriched);
});

// ---- Direct-to-storage track uploads -------------------------------------------------------------
// Audio no longer travels through this server (large files + request timeouts were what made uploads fail):
// the browser asks for a short-lived signed upload, sends the file straight to Cloudinary, then calls
// createTrackHandler with the resulting URLs. The multipart route below is kept for older clients.
const AUDIO_FORMATS = 'mp3,wav,m4a,aac,mp4,ogg,webm';
const COVER_FORMATS = 'jpg,jpeg,png,webp';
const CLOUD = () => (process.env.CLOUDINARY_CLOUD_NAME || '').trim();

async function requireArtist(req, res) {
  const profile = await prisma.artistProfile.findUnique({ where: { userId: req.userId } });
  if (!profile) res.status(404).json({ error: 'Register as an artist first' });
  return profile;
}

export async function uploadSignatureHandler(req, res) {
  if (!(await requireArtist(req, res))) return;
  if (!CLOUD() || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return res.status(503).json({ error: 'Uploads aren’t set up on this server yet.' });
  }
  const kind = req.body?.kind === 'cover' ? 'cover' : 'audio';
  const timestamp = Math.round(Date.now() / 1000);
  const params = kind === 'audio'
    ? { allowed_formats: AUDIO_FORMATS, folder: 'reel/tracks', timestamp }
    : { allowed_formats: COVER_FORMATS, folder: 'reel/track-covers', timestamp };
  const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);
  res.json({
    uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUD()}/${kind === 'audio' ? 'video' : 'image'}/upload`,
    apiKey: process.env.CLOUDINARY_API_KEY,
    signature,
    params, // the client must send exactly these fields alongside the file
    maxBytes: kind === 'audio' ? 50 * 1024 * 1024 : 5 * 1024 * 1024,
  });
}

// Only URLs that point into OUR Cloudinary account and the track folders are accepted.
const urlInFolder = (url, resource, folder) =>
  typeof url === 'string' && url.length < 1000 && url.startsWith(`https://res.cloudinary.com/${CLOUD()}/${resource}/upload/`) && url.includes(`/${folder}/`);

export async function createTrackHandler(req, res) {
  const profile = await requireArtist(req, res);
  if (!profile) return;
  const title = (req.body?.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Track title is required' });
  if (title.length > 120) return res.status(400).json({ error: 'Track title is too long' });

  let audioUrl;
  let coverUrl = null;
  if (req.file) {
    audioUrl = req.file.path; // legacy multipart upload (Cloudinary URL via multer-storage)
  } else {
    audioUrl = req.body?.audioUrl;
    if (!urlInFolder(audioUrl, 'video', 'reel/tracks')) return res.status(400).json({ error: 'Invalid audio upload. Please try again.' });
    if (req.body?.coverUrl) {
      if (!urlInFolder(req.body.coverUrl, 'image', 'reel/track-covers')) return res.status(400).json({ error: 'Invalid cover image. Please try again.' });
      coverUrl = req.body.coverUrl;
    }
  }
  const duration = Number(req.body?.durationSeconds ?? req.body?.duration);
  const track = await prisma.track.create({
    data: {
      artistId: profile.id,
      title,
      audioUrl,
      coverUrl,
      durationSeconds: Number.isFinite(duration) && duration > 0 && duration < 3600 ? Math.round(duration) : null,
    },
  });
  res.status(201).json(track);
}

router.post('/me/tracks/upload-signature', requireAuth, uploadSignatureHandler);
router.post('/me/tracks', requireAuth, (req, res, next) => (req.is('multipart/form-data') ? uploadTrack.single('audio')(req, res, next) : next()), createTrackHandler);

// Lets any creator browse distributed tracks to attach to a new post —
// this is the actual "for other creators to use in their reels" mechanism.
// Trending sounds — ranked by how many *published* reels currently use
// each track (a real signal, unlike tracks/search above which is just
// createdAt desc) with an optional title/artist filter. Powers
// SoundPicker's default (no-query) list; api.js's getTrendingSounds falls
// through to tracks/search if this ever isn't reachable, so nothing breaks
// if this route changes shape later.
router.get('/tracks/trending', async (req, res) => {
  const q = (req.query.q || '').trim();
  const limit = Math.min(Number(req.query.limit) || 30, 50);

  const tracks = await prisma.track.findMany({
    where: q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { artist: { stageName: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {},
    include: {
      artist: { select: { stageName: true } },
      _count: { select: { videos: { where: { status: 'published' } } } },
    },
  });

  tracks.sort((a, b) => b._count.videos - a._count.videos || b.createdAt - a.createdAt);

  res.json(
    tracks.slice(0, limit).map((t) => ({
      id: t.id,
      title: t.title,
      audioUrl: t.audioUrl,
      coverUrl: t.coverUrl,
      artistName: t.artist.stageName,
      durationSeconds: t.durationSeconds,
      useCount: t._count.videos,
    }))
  );
});

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
  res.json(tracks.map((t) => ({ id: t.id, title: t.title, audioUrl: t.audioUrl, coverUrl: t.coverUrl, artistName: t.artist.stageName })));
});

// Other reels using this same sound — powers the SoundPicker's "Reels
// using this sound" grid, opened by tapping a video's vinyl badge in the
// feed (see frontend/src/components/VideoCard.jsx). Public, same as
// tracks/search above — no auth needed just to browse. Declared before the
// generic /tracks/:id below so Express doesn't try to match the trailing
// /videos segment as part of an :id.
export async function trackVideosHandler(req, res) {
  const videos = await prisma.video.findMany({
    where: { trackId: req.params.id, status: 'published' },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { user: { select: { id: true, username: true, avatarUrl: true } } },
  });
  res.json(
    videos.map((v) => ({
      id: v.id,
      thumbnailUrl: v.thumbnailUrl,
      caption: v.caption,
      viewCount: Number(v.viewCount ?? 0), // BigInt column -> plain number for JSON
      likeCount: v.likeCount ?? 0,
      user: v.user,
    }))
  );
}
router.get('/tracks/:id/videos', trackVideosHandler);

// A single track by id — used to preselect a sound handed off via
// /upload?trackId=... (see the SoundPicker "Use This Sound" flow in
// VideoCard.jsx) without re-running a search just to resolve one id.
// Declared LAST among /tracks/* routes: as a catch-all :id param it would
// otherwise shadow the literal /tracks/trending and /tracks/search routes
// above (Express matches route order, and "trending"/"search" would just
// get captured as :id).
export async function trackDetailHandler(req, res) {
  const track = await prisma.track.findUnique({
    where: { id: req.params.id },
    include: {
      artist: { select: { stageName: true, userId: true } },
      _count: { select: { videos: { where: { status: 'published' } } } },
    },
  });
  if (!track) return res.status(404).json({ error: 'Sound not found' });
  res.json({
    id: track.id,
    title: track.title,
    audioUrl: track.audioUrl,
    coverUrl: track.coverUrl,
    artistName: track.artist.stageName,
    artistUserId: track.artist.userId,
    durationSeconds: track.durationSeconds,
    useCount: track._count.videos,
    createdAt: track.createdAt,
  });
}
router.get('/tracks/:id', trackDetailHandler);

export default router;
