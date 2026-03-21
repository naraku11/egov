/**
 * @file authController.js
 * @description Authentication controller for the eGov platform.
 *
 * Handles all identity-related operations for both residents (users) and
 * government servants:
 *  - Resident registration and credential-based login
 *  - Servant (staff) login with department details
 *  - Unified login that resolves the caller's role automatically
 *  - OTP (One-Time Password) request and verification for phone-based auth
 *  - Forgot-password / reset-password flow using a 6-digit code
 *  - Profile retrieval and update (including avatar upload and password change)
 *
 * JWT tokens are signed with the JWT_SECRET env variable and expire after
 * JWT_EXPIRES_IN (default: 7 days).  OTP and reset codes are held in
 * in-memory Maps — replace with Redis for production deployments.
 */

import prisma from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

/**
 * Creates a signed JWT for the given entity.
 *
 * @param {string} id   - The database ID of the user or servant.
 * @param {string} type - Entity type: `'user'` (default) or `'servant'`.
 * @returns {string} Signed JWT string.
 */
const generateToken = (id, type = 'user') => {
  return jwt.sign({ id, type }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// In-memory OTP store: phone → { otp, expiresAt }  (use Redis in production)
const otpStore = new Map();

// In-memory password-reset token store: emailOrPhone → { code, userId, expiresAt }
const resetStore = new Map();

/**
 * POST /auth/register
 * Registers a new resident account.
 *
 * Requires `name` and `barangay`; at least one of `email` or `phone` must be
 * provided.  If a password is supplied it is bcrypt-hashed before storage.
 * The account is marked as verified immediately (simplified — add email
 * verification flow in production).
 *
 * @param {import('express').Request}  req  - Body: { name, email, phone, password, barangay, address }
 * @param {import('express').Response} res  - 201 with token + user on success.
 * @param {import('express').NextFunction} next
 */
export const register = async (req, res, next) => {
  try {
    const { name, email, phone, password, barangay, address } = req.body;

    // Validate required fields
    if (!name || !barangay) {
      return res.status(400).json({ error: 'Name and barangay are required' });
    }
    if (!email && !phone) {
      return res.status(400).json({ error: 'Email or phone is required' });
    }

    // Prevent duplicate accounts on the same email or phone
    const existing = await prisma.user.findFirst({
      where: { OR: [email ? { email } : {}, phone ? { phone } : {}].filter(o => Object.keys(o).length > 0) },
    });
    if (existing) {
      return res.status(409).json({ error: 'User already exists with this email or phone' });
    }

    // Hash the password only if one was provided (phone-OTP users may not have one)
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    const user = await prisma.user.create({
      data: {
        name,
        email: email || null,
        phone: phone || null,
        password: hashedPassword,
        barangay,
        address: address || null,
        isVerified: true, // simplified; add email verification in production
      },
    });

    // Return a token so the client is immediately authenticated after registration
    const token = generateToken(user.id);
    res.status(201).json({
      message: 'Registration successful',
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, barangay: user.barangay },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/login
 * Authenticates a resident by email or phone + password.
 * Kept for backward compatibility; prefer `/auth/unified-login`.
 *
 * @param {import('express').Request}  req  - Body: { email?, phone?, password }
 * @param {import('express').Response} res  - 200 with token + user on success.
 * @param {import('express').NextFunction} next
 */
export const login = async (req, res, next) => {
  try {
    const { email, phone, password } = req.body;

    // Both identifier and password are required
    if (!password) return res.status(400).json({ error: 'Password is required' });
    if (!email && !phone) return res.status(400).json({ error: 'Email or phone is required' });

    // Look up the user by whichever identifier was provided
    const user = await prisma.user.findFirst({
      where: email ? { email } : { phone },
    });

    // Reject if user not found or has no password set (e.g. OTP-only accounts)
    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Constant-time password comparison using bcrypt
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = generateToken(user.id);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, barangay: user.barangay, language: user.language, avatarUrl: user.avatarUrl || null },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/servant/login
 * Authenticates a government servant by email + password.
 * Kept for backward compatibility; prefer `/auth/unified-login`.
 *
 * Updates the servant's `lastActiveAt` timestamp on successful login.
 *
 * @param {import('express').Request}  req  - Body: { email, password }
 * @param {import('express').Response} res  - 200 with token + servant (incl. department) on success.
 * @param {import('express').NextFunction} next
 */
export const servantLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    // Fetch servant with their department so callers don't need a second request
    const servant = await prisma.servant.findUnique({
      where: { email },
      include: { department: true },
    });

    if (!servant) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, servant.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // Record the login time for activity tracking
    await prisma.servant.update({ where: { id: servant.id }, data: { lastActiveAt: new Date() } });

    // Token type 'servant' lets middleware distinguish them from regular users
    const token = generateToken(servant.id, 'servant');
    res.json({
      token,
      servant: {
        id: servant.id,
        name: servant.name,
        email: servant.email,
        position: servant.position,
        department: servant.department,
        status: servant.status,
        avatarUrl: servant.avatarUrl || null,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /auth/profile
 * Returns the authenticated caller's profile, stripping the password hash.
 *
 * Detects whether the caller is a servant or a resident via `req.userType`
 * and returns the appropriate record together with a `type` discriminator.
 *
 * @param {import('express').Request}  req - Populated by `authenticate` middleware.
 * @param {import('express').Response} res - 200 with `{ user|servant, type }`.
 */
export const getProfile = async (req, res) => {
  if (req.userType === 'servant') {
    // Destructure to omit the password field before sending
    const { password: _, ...servant } = req.servant;
    return res.json({ servant, type: 'servant' });
  }
  const { password: _, ...user } = req.user;
  res.json({ user, type: 'user' });
};

/**
 * PUT /auth/profile
 * Updates the authenticated caller's profile fields.
 *
 * Supports:
 *  - Avatar image upload (multipart — stored under /uploads/avatars/)
 *  - Old avatar deletion from disk when a new one is uploaded
 *  - Password change (requires `currentPassword` verification)
 *  - Different field sets for servants vs. residents
 *
 * @param {import('express').Request}  req  - Body: { name?, address?, language?, barangay?,
 *   phone?, position?, currentPassword?, newPassword? }; `req.file` for avatar.
 * @param {import('express').Response} res  - 200 with updated record (password omitted).
 * @param {import('express').NextFunction} next
 */
export const updateProfile = async (req, res, next) => {
  try {
    const { name, address, language, barangay, phone, position, currentPassword, newPassword } = req.body;

    // Resolve new avatar URL if a file was uploaded
    let avatarUrl;
    if (req.file) {
      avatarUrl = `/uploads/avatars/${req.file.filename}`;
    }

    /**
     * Removes a locally-stored avatar from the filesystem.
     * Remote URLs (starting with 'http') are left untouched.
     *
     * @param {string|null} oldUrl - Relative server path of the previous avatar.
     */
    const deleteOldAvatar = (oldUrl) => {
      if (!oldUrl || oldUrl.startsWith('http')) return;
      try {
        const filePath = path.join(process.cwd(), oldUrl);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch { /* ignore */ }
    };

    // --- Servant branch ---
    if (req.userType === 'servant') {
      if (newPassword) {
        // Require current password before allowing a change
        if (!currentPassword) return res.status(400).json({ error: 'Current password is required to set a new one' });
        if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
        const record = await prisma.servant.findUnique({ where: { id: req.servant.id } });
        const valid = await bcrypt.compare(currentPassword, record.password);
        if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
      }

      // Delete the old avatar file if a new one was uploaded
      if (avatarUrl && req.servant.avatarUrl) deleteOldAvatar(req.servant.avatarUrl);

      // Build the update payload with only the fields that were provided
      const data = {};
      if (name)                data.name      = name;
      if (phone !== undefined) data.phone     = phone || null;
      if (position)            data.position  = position;
      if (avatarUrl)           data.avatarUrl = avatarUrl;
      if (newPassword)         data.password  = await bcrypt.hash(newPassword, 10);

      const updated = await prisma.servant.update({
        where: { id: req.servant.id },
        data,
        include: { department: true },
      });
      const { password: _, ...result } = updated;
      return res.json(result);
    }

    // --- Resident / admin branch ---
    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'Current password is required to set a new one' });
      if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
      if (!req.user.password) return res.status(400).json({ error: 'No password set for this account' });
      const valid = await bcrypt.compare(currentPassword, req.user.password);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Delete the old avatar file if a new one was uploaded
    if (avatarUrl && req.user.avatarUrl) deleteOldAvatar(req.user.avatarUrl);

    // Build the update payload with only the fields that were provided
    const data = {};
    if (name)                  data.name      = name;
    if (address !== undefined) data.address   = address || null;
    if (barangay)              data.barangay  = barangay;
    if (phone !== undefined)   data.phone     = phone || null;
    if (language)              data.language  = language;
    if (avatarUrl)             data.avatarUrl = avatarUrl;
    if (newPassword)           data.password  = await bcrypt.hash(newPassword, 10);

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data,
    });
    // Strip password hash before returning the updated record
    const { password: _, ...result } = updated;
    res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/otp/request
 * Generates a 6-digit OTP and associates it with a phone number.
 * The OTP expires in 5 minutes.
 *
 * In production, deliver the code via Twilio (or equivalent SMS gateway).
 * Currently the code is only logged to the console.
 *
 * @param {import('express').Request}  req - Body: { phone }
 * @param {import('express').Response} res - 200 with success message.
 */
export const requestOtp = async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone is required' });

  // Generate a random 6-digit numeric code
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  // Store with a 5-minute TTL
  otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

  // In production: send via Twilio
  console.log(`OTP for ${phone}: ${otp}`);
  res.json({ message: 'OTP sent successfully' });
};

/**
 * POST /auth/otp/verify
 * Validates an OTP and logs the user in (or creates a new guest account if
 * no account exists for the phone number).
 *
 * The OTP is removed from the store after a single successful use.
 *
 * @param {import('express').Request}  req  - Body: { phone, otp }
 * @param {import('express').Response} res  - 200 with token + user on success.
 * @param {import('express').NextFunction} next
 */
export const verifyOtp = async (req, res, next) => {
  try {
    const { phone, otp } = req.body;
    const stored = otpStore.get(phone);

    // Reject if no OTP was requested, the code doesn't match, or it expired
    if (!stored || stored.otp !== otp || Date.now() > stored.expiresAt) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Consume the OTP so it cannot be reused
    otpStore.delete(phone);

    // Look up or create the user account for this phone number
    let user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      // Auto-create a minimal guest account so the user can complete their profile later
      user = await prisma.user.create({
        data: { phone, name: 'Guest User', barangay: 'Unknown', isVerified: true },
      });
    }

    const token = generateToken(user.id);
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, role: user.role } });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/unified-login
 * Single login endpoint that accepts an email address or phone number and
 * resolves the account across both the User and Servant tables.
 *
 * Resolution order:
 *  1. Check the User table (email or phone match).
 *  2. If the identifier is an email address, also check the Servant table.
 *
 * Returns a `type` field (`'user'` or `'servant'`) so clients can route to
 * the correct dashboard without a second request.
 *
 * @param {import('express').Request}  req  - Body: { emailOrPhone, password }
 * @param {import('express').Response} res  - 200 with type, token and entity on success.
 * @param {import('express').NextFunction} next
 */
export const unifiedLogin = async (req, res, next) => {
  try {
    const { emailOrPhone, password } = req.body;
    if (!emailOrPhone || !password) {
      return res.status(400).json({ error: 'Email/phone and password are required' });
    }

    // Determine lookup strategy: email uses @, phone does not
    const isEmail = emailOrPhone.includes('@');

    // 1. Try User table
    const user = await prisma.user.findFirst({
      where: isEmail ? { email: emailOrPhone } : { phone: emailOrPhone },
    });

    if (user && user.password) {
      const valid = await bcrypt.compare(password, user.password);
      if (valid) {
        const token = generateToken(user.id, 'user');
        return res.json({
          type: 'user',
          token,
          user: {
            id: user.id, name: user.name, email: user.email, phone: user.phone,
            role: user.role, barangay: user.barangay, language: user.language,
            avatarUrl: user.avatarUrl || null,
          },
        });
      }
    }

    // 2. Try Servant table (email only — servants don't log in by phone)
    if (isEmail) {
      const servant = await prisma.servant.findUnique({
        where: { email: emailOrPhone },
        include: { department: true },
      });

      if (servant) {
        const valid = await bcrypt.compare(password, servant.password);
        if (valid) {
          // Keep the last-active timestamp current for activity monitoring
          await prisma.servant.update({ where: { id: servant.id }, data: { lastActiveAt: new Date() } });
          const token = generateToken(servant.id, 'servant');
          return res.json({
            type: 'servant',
            token,
            servant: {
              id: servant.id, name: servant.name, email: servant.email,
              position: servant.position, department: servant.department,
              status: servant.status, avatarUrl: servant.avatarUrl || null,
            },
          });
        }
      }
    }

    // Neither table matched — use a generic message to avoid leaking account existence
    return res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/forgot-password
 * Sends a 6-digit reset code to the resident's email or phone.
 *
 * Always responds with HTTP 200 regardless of whether an account was found,
 * preventing account-enumeration attacks.  The code expires after 15 minutes.
 * In production, deliver via email (e.g. SendGrid) or SMS (e.g. Twilio);
 * currently the code is only logged to the console.
 *
 * @param {import('express').Request}  req  - Body: { emailOrPhone }
 * @param {import('express').Response} res  - 200 with a generic success message.
 * @param {import('express').NextFunction} next
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { emailOrPhone } = req.body;
    if (!emailOrPhone) return res.status(400).json({ error: 'Email or phone is required' });

    const isEmail = emailOrPhone.includes('@');
    const user = await prisma.user.findFirst({
      where: isEmail ? { email: emailOrPhone } : { phone: emailOrPhone },
    });

    // Always respond 200 so we don't expose whether an account exists
    if (!user) return res.json({ message: 'If an account exists, a reset code has been sent' });

    // Generate a random 6-digit reset code with a 15-minute TTL
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    resetStore.set(emailOrPhone, { code, userId: user.id, expiresAt: Date.now() + 15 * 60 * 1000 });

    // In production: send via email or SMS. For now, log to console.
    console.log(`[RESET CODE] ${emailOrPhone}: ${code}`);

    res.json({ message: 'If an account exists, a reset code has been sent' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/reset-password
 * Validates a reset code and updates the resident's password.
 *
 * The reset code is consumed after a single successful use to prevent replay.
 *
 * @param {import('express').Request}  req  - Body: { emailOrPhone, code, newPassword }
 * @param {import('express').Response} res  - 200 with success message on valid code.
 * @param {import('express').NextFunction} next
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { emailOrPhone, code, newPassword } = req.body;
    if (!emailOrPhone || !code || !newPassword) {
      return res.status(400).json({ error: 'emailOrPhone, code, and newPassword are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Validate the reset code against the in-memory store
    const stored = resetStore.get(emailOrPhone);
    if (!stored || stored.code !== code || Date.now() > stored.expiresAt) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    // Consume the code so it cannot be reused
    resetStore.delete(emailOrPhone);

    // Hash and persist the new password
    await prisma.user.update({
      where: { id: stored.userId },
      data: { password: await bcrypt.hash(newPassword, 10) },
    });

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
};
