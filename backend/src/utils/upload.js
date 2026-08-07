import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

function fileFilter(_req, file, cb) {
  const allowed = ['video/mp4', 'video/quicktime', 'video/webm'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Unsupported video format'));
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB cap
});

// Separate config for profile photos — its own subdirectory, image mimetypes
// only, and a much smaller size cap than raw video uploads.
const avatarDir = path.join(uploadDir, 'avatars');
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const unique = `${req.userId}-${Date.now()}`;
    cb(null, `${unique}${path.extname(file.originalname) || '.jpg'}`);
  },
});

function imageFileFilter(_req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Unsupported image format — use JPG, PNG, WEBP, or GIF'));
}

export const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB cap
});

// Audio tracks distributed by verified artists for other creators to use.
const trackDir = path.join(uploadDir, 'tracks');
if (!fs.existsSync(trackDir)) fs.mkdirSync(trackDir, { recursive: true });

const trackStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, trackDir),
  filename: (req, file, cb) => {
    const unique = `${req.userId}-${Date.now()}`;
    cb(null, `${unique}${path.extname(file.originalname) || '.mp3'}`);
  },
});

function audioFileFilter(_req, file, cb) {
  const allowed = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Unsupported audio format — use MP3, WAV, M4A, or AAC'));
}

export const uploadTrack = multer({
  storage: trackStorage,
  fileFilter: audioFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB cap
});
