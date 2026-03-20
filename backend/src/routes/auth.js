import { Router } from 'express';
import {
  register,
  login,
  servantLogin,
  unifiedLogin,
  getProfile,
  updateProfile,
  requestOtp,
  verifyOtp,
  forgotPassword,
  resetPassword,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { avatarUpload } from '../middleware/upload.js';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);             // kept for backward-compat
router.post('/servant/login', servantLogin); // kept for backward-compat
router.post('/unified-login', unifiedLogin);
router.post('/otp/request', requestOtp);
router.post('/otp/verify', verifyOtp);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, avatarUpload.single('avatar'), updateProfile);

export default router;
