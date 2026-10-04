import { Router } from 'express';
import { getDashboard, getActivity, getReports } from '../controllers/dashboardController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/',          getDashboard);
router.get('/activity',  getActivity);
router.get('/reports',   getReports);

export default router;
