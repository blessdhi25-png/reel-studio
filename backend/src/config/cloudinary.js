import { v2 as cloudinary } from 'cloudinary';

// Every upload storage engine in utils/upload.js configures against this
// one instance. Avatars, banners, raw video, and artist tracks used to be
// written with multer.diskStorage() straight to this server's local disk —
// fine for local dev, but both Vercel and Render treat the filesystem as
// ephemeral: it's wiped on every redeploy (and on Vercel serverless,
// between invocations). That's why uploaded media kept disappearing.
// Cloudinary is a real persistent, CDN-backed store — files uploaded here
// survive redeploys and are served from a fast edge URL instead of this
// server's own disk.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export default cloudinary;
