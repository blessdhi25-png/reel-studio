import prisma from '../config/db.js';
import cloudinary from '../config/cloudinary.js';
import { cloudinaryPublicIdFromUrl } from './upload.js';

// Shared by routes/videos.js's self-service DELETE /:id and
// controllers/adminController.js's admin takedown DELETE /:id — both need
// to do exactly the same two things (destroy the Cloudinary assets, then
// remove the DB row and everything that references it), so this is the one
// place that logic lives rather than being copy-pasted between them.
//
// Returns { cloudinaryErrors: string[] } — cloudinaryErrors is non-empty
// when a Cloudinary destroy call failed; callers decide whether/how to
// surface that (it never blocks the delete itself — see the comment below).
export async function deleteVideoCascade(video) {
  // Cloudinary cleanup is best-effort and happens before the DB delete: if
  // it fails (network blip, already-gone asset, a pre-Cloudinary-migration
  // record with a local rawPath instead of a Cloudinary URL), that should
  // never block the delete — worst case is an orphaned asset sitting in
  // the Cloudinary account instead of a video nobody can see or manage
  // anymore. cloudinaryPublicIdFromUrl returns null for anything that
  // isn't a recognizable Cloudinary URL, which the destroy calls below
  // simply skip.
  const rawPublicId = cloudinaryPublicIdFromUrl(video.rawPath);
  const thumbnailPublicId = cloudinaryPublicIdFromUrl(video.thumbnailUrl);

  const destroyJobs = [];
  if (rawPublicId) {
    destroyJobs.push(cloudinary.uploader.destroy(rawPublicId, { resource_type: 'video' }));
  }
  if (thumbnailPublicId) {
    destroyJobs.push(cloudinary.uploader.destroy(thumbnailPublicId, { resource_type: 'image' }));
  }
  // NOTE: this doesn't yet clean up the HLS output (playlist + .ts
  // segments) — that's still written to local disk by the transcode
  // worker (see workers/transcode.js) rather than Cloudinary, and is a
  // known gap flagged there too.
  const cloudinaryErrors = [];
  if (destroyJobs.length) {
    const results = await Promise.allSettled(destroyJobs);
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error(`[deleteVideoCascade] Cloudinary cleanup failed for video ${video.id}:`, r.reason);
        cloudinaryErrors.push(String(r.reason?.message || r.reason));
      }
    }
  }

  // None of Like/Bookmark/Comment/FeedEvent's relations to Video cascade
  // (see schema.prisma) — a plain prisma.video.delete() throws a foreign
  // key violation the moment the video has any engagement at all, which in
  // practice is nearly every real video: a FeedEvent 'impression' row gets
  // written on every single play (see the impression logging in
  // VideoCard.jsx), so this would 500 on almost any post anyone actually
  // watched. Deleting the dependents first, in one transaction, fixes
  // that. Transaction (tip) rows are the one exception — those are payment
  // records between two users, so instead of deleting them this nulls out
  // their optional videoId and leaves the transaction itself intact,
  // preserving payout/payment history after the video is gone. Report rows
  // referencing this video are left as-is too — Report.targetId is a
  // loose string, not an FK, so there's no constraint to satisfy, and
  // keeping them is actually useful: it's the historical record of why a
  // piece of content got reported and later taken down.
  await prisma.$transaction([
    prisma.like.deleteMany({ where: { videoId: video.id } }),
    prisma.bookmark.deleteMany({ where: { videoId: video.id } }),
    prisma.comment.deleteMany({ where: { videoId: video.id } }),
    prisma.feedEvent.deleteMany({ where: { videoId: video.id } }),
    // Same reasoning as Like/Bookmark above — CollectionItem.videoId is a
    // real FK (see the Deep Bookmarking & Shared Collections schema in
    // schema.prisma), so a video saved into any collection would otherwise
    // block deletion with a foreign key violation. The collections
    // themselves are untouched, they just lose this one saved item.
    prisma.collectionItem.deleteMany({ where: { videoId: video.id } }),
    prisma.transaction.updateMany({ where: { videoId: video.id }, data: { videoId: null } }),
    prisma.video.delete({ where: { id: video.id } }),
  ]);

  return { cloudinaryErrors };
}
