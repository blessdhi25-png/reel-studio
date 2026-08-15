import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getCreatorAnalytics } from '../controllers/analytics.js';

const router = Router();

router.get('/overview', requireAuth, getCreatorAnalytics);

export default router;
