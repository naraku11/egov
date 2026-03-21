/**
 * @file routes/auth.js
 * @description Express router for all authentication-related endpoints.
 *
 * Public routes (no token required):
 *  POST /auth/register          — Create a new resident account
 *  POST /auth/login             — Resident login (legacy; email/phone + password)
 *  POST /auth/servant/login     — Servant login (legacy; email + password)
 *  POST /auth/unified-login     — Single login endpoint resolving users and servants
 *  POST /auth/otp/request       — Request an SMS OTP for phone-based login
 *  POST /auth/otp/verify        — Verify OTP and exchange for a JWT
 *  POST /auth/forgot-password   — Request a 6-digit password-reset code
 *  POST /auth/reset-password    — Verify reset code and set a new password
 *
 * Protected routes (Bearer JWT required):
 *  GET  /auth/profile           — Retrieve the caller's profile
 *  PUT  /auth/profile           — Update profile fields; optionally upload avatar
 *
 * The `authenticate` middleware validates the JWT and populates `req.user` or
 * `req.servant` depending on the token type.  Avatar uploads are handled by
 * the `avatarUpload` multer middleware, which accepts a single `avatar` field.
 */

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

// ---------------------------------------------------------------------------
// Public routes — no authentication required
// ---------------------------------------------------------------------------

/** Register a new resident account. */
router.post('/register', register);

/** Resident credential login (kept for backward compatibility). */
router.post('/login', login);             // kept for backward-compat

/** Servant credential login (kept for backward compatibility). */
router.post('/servant/login', servantLogin); // kept for backward-compat

/** Single login that auto-detects user vs. servant across both tables. */
router.post('/unified-login', unifiedLogin);

/** Generate and dispatch a one-time password to the given phone number. */
router.post('/otp/request', requestOtp);

/** Validate an OTP and issue a JWT, creating a guest account if needed. */
router.post('/otp/verify', verifyOtp);

/** Initiate the forgot-password flow by sending a reset code. */
router.post('/forgot-password', forgotPassword);

/** Verify a reset code and update the resident's password. */
router.post('/reset-password', resetPassword);

// ---------------------------------------------------------------------------
// Protected routes — valid JWT required (authenticate middleware)
// ---------------------------------------------------------------------------

/** Return the authenticated user's or servant's profile (password omitted). */
router.get('/profile', authenticate, getProfile);

/**
 * Update profile fields.  Accepts an optional `avatar` file via multipart
 * form-data; the upload middleware stores it under /uploads/avatars/.
 */
router.put('/profile', authenticate, avatarUpload.single('avatar'), updateProfile);

export default router;
