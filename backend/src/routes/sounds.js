import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createTrackHandler, trackDetailHandler, trackVideosHandler, uploadSignatureHandler } from './artists.js';

// /api/v1/sounds — the same catalog as /artists/tracks, under the name the product uses ("sounds"):
//   POST /sounds/upload-signature  -> signed direct-to-storage upload parameters (artists only)
//   POST /sounds                   -> save a track after the browser uploaded it { title, audioUrl, coverUrl?, durationSeconds? }
//   GET  /sounds/:id               -> one sound
//   GET  /sounds/:id/videos        -> published videos that use it
const router = Router();
router.post('/upload-signature', requireAuth, uploadSignatureHandler);
router.post('/', requireAuth, createTrackHandler);
router.get('/:id/videos', trackVideosHandler);
router.get('/:id', trackDetailHandler);
export default router;
