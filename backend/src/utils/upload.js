import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary.js';

// All four upload types below (raw video, avatars, banners, artist tracks)
// used to write to local disk via multer.diskStorage(). That broke the
// moment this app moved onto Vercel/Render, since neither guarantees the
// filesystem survives a redeploy — see config/cloudinary.js for the full
// explanation. Every one of these now streams straight to Cloudinary
// instead via multer-storage-cloudinary, which never touches this server's
// disk; what comes back on `req.file` is a permanent HTTPS CDN URL
// (`req.file.path`) rather than a local filename, and `req.file.filename`
// is Cloudinary's public_id rather than a name on disk.

function imageFileFilter(_req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Unsupported image format — use JPG, PNG, WEBP, or GIF'));
}

function videoFileFilter(_req, file, cb) {
  const allowed = ['video/mp4', 'video/quicktime', 'video/webm'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Unsupported video format'));
}

function audioFileFilter(_req, file, cb) {
  const allowed = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Unsupported audio format — use MP3, WAV, M4A, or AAC'));
}

// Raw video uploads. resource_type: 'video' is required — without it
// Cloudinary tries to run the file through its image pipeline and rejects
// it. chunk_size streams the upload in pieces instead of buffering the
// whole file in memory first, which matters at the 2GB cap below.
// req.userId is set by requireAuth, which runs before multer in every
// route this is mounted on (see routes/videos.js).
const videoStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req) => ({
    folder: 'reel/videos',
    resource_type: 'video',
    public_id: `${req.userId}-${Date.now()}`,
    chunk_size: 6 * 1024 * 1024,
  }),
});

export const upload = multer({
  storage: videoStorage,
  fileFilter: videoFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB cap
});

// Profile photos. The frontend now compresses/resizes these client-side
// before they're ever sent (see lib/imageCompression.js) — the
// transformation below is a server-side backstop for anyone hitting this
// endpoint directly, not the primary size control.
const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req) => ({
    folder: 'reel/avatars',
    resource_type: 'image',
    public_id: `${req.userId}-${Date.now()}`,
    transformation: [{ width: 1200, height: 1200, crop: 'limit' }],
  }),
});

export const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB cap
});

// Cover/profile banners — same treatment as avatars, separate folder.
const bannerStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req) => ({
    folder: 'reel/banners',
    resource_type: 'image',
    public_id: `${req.userId}-${Date.now()}`,
    transformation: [{ width: 1200, height: 1200, crop: 'limit' }],
  }),
});

export const uploadBanner = multer({
  storage: bannerStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB cap
});

// Audio tracks distributed by verified artists. Cloudinary has no distinct
// "audio" resource type — 'video' covers audio-only files too.
const trackStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req) => ({
    folder: 'reel/tracks',
    resource_type: 'video',
    public_id: `${req.userId}-${Date.now()}`,
  }),
});

export const uploadTrack = multer({
  storage: trackStorage,
  fileFilter: audioFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB cap
});
