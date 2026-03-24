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
  verifyAuthOtp,
  resendAuthOtp,
  verifyFirebasePhone,
  verifyPhoneOtp,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { avatarUpload, idUpload } from '../middleware/upload.js';
import { verifyIdPhoto } from '../services/idVerifier.js';

const router = Router();

// ---------------------------------------------------------------------------
// Public routes — no authentication required
// ---------------------------------------------------------------------------

/** Register a new resident account (accepts optional ID photo via multipart). */
router.post('/register', idUpload.single('idPhoto'), register);

/**
 * POST /auth/verify-id
 * Verify an uploaded ID photo using Claude Vision AI.
 * Accepts a single image file and the registrant's name.
 * Returns verification result (valid/invalid, ID type, name match, confidence).
 */
router.post('/verify-id', idUpload.single('idPhoto'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No ID photo uploaded' });
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required for verification' });

    const filePath = req.file.path;
    const result = await verifyIdPhoto(filePath, name);

    // Clean up the temp file after verification (the real upload happens at registration)
    try { const fs = await import('fs'); fs.default.unlinkSync(filePath); } catch {}

    res.json(result);
  } catch (err) {
    next(err);
  }
});

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

/** Verify the 6-digit auth OTP sent during login or registration. */
router.post('/verify-auth-otp', verifyAuthOtp);

/** Resend the auth OTP for login or registration. */
router.post('/resend-otp', resendAuthOtp);

/** Verify Firebase Phone Auth token and issue a local JWT. */
router.post('/firebase/verify-phone', verifyFirebasePhone);

/** Verify phone via Firebase during login/register OTP flow. */
router.post('/verify-phone-otp', verifyPhoneOtp);

/**
 * POST /auth/reupload-id
 * Allows users with PENDING_REVIEW or REJECTED idStatus to reupload a new ID photo.
 * Requires email/phone + password since the user cannot login yet.
 * Updates idPhotoUrl and resets idStatus based on the new OCR result.
 */
router.post('/reupload-id', idUpload.single('idPhoto'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No ID photo uploaded' });

    const { emailOrPhone, password, idNameMatch } = req.body;
    if (!emailOrPhone || !password) {
      return res.status(400).json({ error: 'Email/phone and password are required' });
    }

    const isEmail = emailOrPhone.includes('@');
    const user = await (await import('../lib/prisma.js')).default.user.findFirst({
      where: isEmail ? { email: emailOrPhone } : { phone: emailOrPhone },
    });

    if (!user || !user.password) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const bcryptMod = await import('bcryptjs');
    const valid = await bcryptMod.default.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!['PENDING_REVIEW', 'REJECTED'].includes(user.idStatus)) {
      return res.status(400).json({ error: 'ID reupload is not needed for this account' });
    }

    // Delete old ID photo if it exists
    if (user.idPhotoUrl) {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const oldPath = path.default.join(process.cwd(), user.idPhotoUrl.replace(/^\//, ''));
        if (fs.default.existsSync(oldPath)) fs.default.unlinkSync(oldPath);
      } catch {}
    }

    const idPhotoUrl = `/uploads/ids/${req.file.filename}`;
    const newIdStatus = idNameMatch === 'true' ? 'VERIFIED' : 'PENDING_REVIEW';

    const prismaClient = (await import('../lib/prisma.js')).default;
    await prismaClient.user.update({
      where: { id: user.id },
      data: { idPhotoUrl, idStatus: newIdStatus },
    });

    if (newIdStatus === 'VERIFIED') {
      return res.json({ verified: true, message: 'ID verified successfully! You can now login.' });
    }

    res.json({ verified: false, message: 'New ID uploaded. It will be reviewed by admin.' });
  } catch (err) {
    next(err);
  }
});

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
