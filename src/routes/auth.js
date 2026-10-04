import { Router } from 'express';
import { login, getMe, updateProfile, changePassword } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.post('/login',           login);
router.get('/me',               protect, getMe);
router.put('/update-profile',   protect, updateProfile);
router.put('/change-password',  protect, changePassword);

export default router;
