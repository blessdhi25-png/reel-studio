import multer from 'multer';
import cloudinary from '../config/cloudinary.js';

// All four upload types below (raw video, avatars, banners, artist tracks)
// used to write to local disk via multer.diskStorage(). That broke the
// moment this app moved onto Vercel/Render, since neither guarantees the
// filesystem survives a redeploy — see config/cloudinary.js for the full
// explanation. Every one of these now streams straight to Cloudinary
// instead; what comes back on `req.file` is a permanent HTTPS CDN URL
// (`req.file.path`) rather than a local filename, and `req.file.filename`
// is Cloudinary's public_id rather than a name on disk.
//
// This uses a small hand-rolled multer storage engine (below) rather than
// the multer-storage-cloudinary package: that package's latest release
// (v4) hard-pins a peer dependency on cloudinary@^1.x, which conflicts with
// cloudinary@^2.x (the current SDK, and what this project actually wants)
// and fails `npm install` with an ERESOLVE error. The engine itself is
// just a thin adapter over cloudinary.uploader.upload_stream(), which is
// all that package was doing internally anyway.

class CloudinaryStorageEngine {
  // optionsFn: (req, file) => object | Promise<object> — Cloudinary upload
  // options (folder, resource_type, public_id, etc.), computed per-file so
  // it can depend on req.userId (set by requireAuth, which runs before
  // multer on every route this is mounted on).
  constructor(optionsFn) {
    this.optionsFn = optionsFn;
  }

  _handleFile(req, file, cb) {
    Promise.resolve(this.optionsFn(req, file))
      .then((options) => {
        const uploadStream = cloudinary.uploader.upload_stream(options, (err, result) => {
          if (err) return cb(err);
          cb(null, {
            path: result.secure_url,
            filename: result.public_id,
            size: result.bytes,
            resourceType: result.resource_type,
          });
        });
        file.stream.on('error', (err) => uploadStream.destroy(err));
        file.stream.pipe(uploadStream);
      })
      .catch(cb);
  }

  _removeFile(_req, file, cb) {
    cloudinary.uploader
      .destroy(file.filename, { resource_type: file.resourceType || 'image' })
      .then(() => cb(null))
      .catch(cb);
  }
}

function cloudinaryStorage(optionsFn) {
  return new CloudinaryStorageEngine(optionsFn);
}

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
const videoStorage = cloudinaryStorage(async (req) => ({
  folder: 'reel/videos',
  resource_type: 'video',
  public_id: `${req.userId}-${Date.now()}`,
  chunk_size: 6 * 1024 * 1024,
}));

export const upload = multer({
  storage: videoStorage,
  fileFilter: videoFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB cap
});

// Video + an optional client-generated poster frame in one request. Added
// because POST /videos never set thumbnailUrl at all — it was only ever
// meant to be filled in later by POST /:id/complete once a transcode
// worker ran, but no such worker actually runs in this deployment, so
// every video's thumbnail stayed empty forever. Generating a poster frame
// client-side (see app/upload/page.jsx's generateThumbnail) and sending it
// alongside the video here fixes that without needing a real transcode
// pipeline. Both fields share one multer() config since Cloudinary options
// differ per field (video vs image) but the underlying storage engine
// already receives `file` — including file.fieldname — so one combined
// optionsFn below can branch on it.
const videoWithThumbnailStorage = cloudinaryStorage(async (req, file) => {
  if (file.fieldname === 'thumbnail') {
    return {
      folder: 'reel/thumbnails',
      resource_type: 'image',
      public_id: `${req.userId}-${Date.now()}-thumb`,
      transformation: [{ width: 720, height: 1280, crop: 'limit' }],
    };
  }
  return {
    folder: 'reel/videos',
    resource_type: 'video',
    public_id: `${req.userId}-${Date.now()}`,
    chunk_size: 6 * 1024 * 1024,
  };
});

function videoOrThumbnailFileFilter(req, file, cb) {
  if (file.fieldname === 'thumbnail') return imageFileFilter(req, file, cb);
  return videoFileFilter(req, file, cb);
}

export const uploadVideoWithThumbnail = multer({
  storage: videoWithThumbnailStorage,
  fileFilter: videoOrThumbnailFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB cap — applies per file, thumbnail is only ever a few hundred KB
});

// Profile photos. The frontend now compresses/resizes these client-side
// before they're ever sent (see lib/imageCompression.js) — the
// transformation below is a server-side backstop for anyone hitting this
// endpoint directly, not the primary size control.
const avatarStorage = cloudinaryStorage(async (req) => ({
  folder: 'reel/avatars',
  resource_type: 'image',
  public_id: `${req.userId}-${Date.now()}`,
  transformation: [{ width: 1200, height: 1200, crop: 'limit' }],
}));

export const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB cap
});

// Cover/profile banners — same treatment as avatars, separate folder.
const bannerStorage = cloudinaryStorage(async (req) => ({
  folder: 'reel/banners',
  resource_type: 'image',
  public_id: `${req.userId}-${Date.now()}`,
  transformation: [{ width: 1200, height: 1200, crop: 'limit' }],
}));

export const uploadBanner = multer({
  storage: bannerStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB cap
});

// Audio tracks distributed by verified artists. Cloudinary has no distinct
// "audio" resource type — 'video' covers audio-only files too.
const trackStorage = cloudinaryStorage(async (req) => ({
  folder: 'reel/tracks',
  resource_type: 'video',
  public_id: `${req.userId}-${Date.now()}`,
}));

export const uploadTrack = multer({
  storage: trackStorage,
  fileFilter: audioFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB cap
});

function storyMediaFileFilter(_req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Unsupported file — use JPG, PNG, WEBP, GIF, MP4, MOV, or WEBM'));
}

// Stories accept either an image or a short video through the same field,
// so resource_type has to be picked per-file rather than fixed like the
// other upload configs above — 'auto' lets Cloudinary detect it instead of
// rejecting a video sent through what would otherwise be an image-only
// pipeline (or vice versa).
const storyStorage = cloudinaryStorage(async (req) => ({
  folder: 'reel/stories',
  resource_type: 'auto',
  public_id: `${req.userId}-${Date.now()}`,
}));

export const uploadStoryMedia = multer({
  storage: storyStorage,
  fileFilter: storyMediaFileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB cap — short-form, not a full reel upload
});

// The Video/thumbnail records only ever stored the full Cloudinary
// secure_url (see routes/videos.js and workers/transcode.js) — there's no
// separate public_id column. cloudinary.uploader.destroy() needs the
// public_id though, not the URL, so this pulls it back out: a Cloudinary
// delivery URL is always
//   https://res.cloudinary.com/<cloud>/<resource_type>/upload/[v<version>/]<public_id>.<ext>
// and since folders are just a prefix baked into public_id, capturing
// everything between "/upload/" (skipping an optional version segment) and
// the final extension recovers exactly the public_id upload.js set at
// upload time (e.g. "reel/videos/<userId>-<timestamp>").
// Returns null for anything that isn't a recognizable Cloudinary URL —
// callers should treat that as "nothing to delete" rather than an error,
// since older/legacy records may predate the Cloudinary migration.
export function cloudinaryPublicIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?(?:\?.*)?$/);
  return match ? match[1] : null;
}
