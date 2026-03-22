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
import dns from 'dns';
import { promisify } from 'util';
import { sendWelcomeEmail, sendResetCodeEmail, sendOtpEmail } from '../services/notification.js';
import { getFirebaseAuth } from '../lib/firebase.js';

const resolveMx = promisify(dns.resolveMx);

/**
 * Validates an email address:
 *  1. Format check (regex)
 *  2. Block disposable/temp email domains
 *  3. MX record lookup — domain must have a mail server
 *
 * @param {string} email
 * @returns {{ valid: boolean, reason?: string }}
 */
const validateEmail = async (email) => {
  // Basic format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, reason: 'Invalid email format' };
  }

  const domain = email.split('@')[1].toLowerCase();

  // Block common disposable/temporary email providers
  const disposable = [
    'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
    'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
    'dispostable.com', 'trashmail.com', 'fakeinbox.com', 'tempail.com',
    'temp-mail.org', 'emailondeck.com', 'getnada.com', 'mohmal.com',
    'maildrop.cc', 'discard.email', '10minutemail.com', 'minutemail.com',
  ];
  if (disposable.includes(domain)) {
    return { valid: false, reason: 'Disposable email addresses are not allowed' };
  }

  // MX record check — verify domain can receive email
  try {
    const records = await resolveMx(domain);
    if (!records || records.length === 0) {
      return { valid: false, reason: 'Email domain does not accept mail' };
    }
  } catch {
    return { valid: false, reason: 'Email domain does not exist' };
  }

  return { valid: true };
};

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

// In-memory auth-OTP store: key → { otp, expiresAt, type, pendingUser? }
// For login: key = userId. For register: key = generated pending ID (no DB record yet).
const authOtpStore = new Map();

// In-memory password-reset token store: emailOrPhone → { code, userId, expiresAt }
const resetStore = new Map();

/**
 * Generates a 6-digit OTP and sends it to the user's email and/or phone.
 * Stores the OTP keyed by userId for later verification.
 *
 * @param {string} userId - The user's database ID.
 * @param {object} user   - User record with { name, email, phone }.
 * @param {string} type   - 'login' or 'register'.
 * @returns {{ sentTo: { email: boolean, phone: boolean } }}
 */
/**
 * @param {string} userId
 * @param {object} user - { name, email, phone }
 * @param {string} type - 'login' or 'register'
 * @param {object} [opts]
 * @param {boolean} [opts.preferEmail] - true when user logged in with email
 * @param {boolean} [opts.preferPhone] - true when user logged in with phone
 */
const generateAndSendAuthOtp = async (userId, user, type, opts = {}) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  authOtpStore.set(userId, { otp, expiresAt: Date.now() + 5 * 60 * 1000, type });

  const sentTo = { email: false, phone: false };

  // Login: use the same channel the user logged in with
  // Register: phone first (Firebase SMS), email fallback
  const useEmail = opts.preferEmail && user.email;
  const usePhone = opts.preferPhone && user.phone;

  if (useEmail) {
    // User logged in with email → send email OTP
    try {
      await sendOtpEmail(user.email, user.name, otp);
      sentTo.email = true;
    } catch (err) {
      console.error(`📧 OTP email failed for ${user.email}:`, err.message);
    }
  } else if (usePhone) {
    // User logged in with phone → Firebase SMS on frontend
    sentTo.phone = true;
  } else if (user.phone) {
    // Default: phone first (Firebase SMS on frontend)
    sentTo.phone = true;
  } else if (user.email) {
    // Fallback: email OTP
    try {
      await sendOtpEmail(user.email, user.name, otp);
      sentTo.email = true;
    } catch (err) {
      console.error(`📧 OTP email failed for ${user.email}:`, err.message);
    }
  }

  console.log(`🔐 Auth OTP for ${user.name} (${userId}): ${otp} [${type}]`);
  return { sentTo, phone: user.phone || null };
};

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

    // Validate email is legitimate (format, not disposable, MX records exist)
    if (email) {
      const emailCheck = await validateEmail(email);
      if (!emailCheck.valid) {
        return res.status(400).json({ error: emailCheck.reason });
      }
    }

    // Prevent duplicate accounts on the same email or phone
    const existing = await prisma.user.findFirst({
      where: { OR: [email ? { email } : {}, phone ? { phone } : {}].filter(o => Object.keys(o).length > 0) },
    });
    if (existing) {
      return res.status(409).json({ error: 'User already exists with this email or phone' });
    }

    // Hash password now but DO NOT save to DB yet — wait for OTP verification
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    // Generate a temporary pending ID (not a real DB id)
    const pendingId = 'pending_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    const pendingUser = { name, email: email || null, phone: phone || null, password: hashedPassword, barangay, address: address || null };

    // Generate OTP and store pending registration data alongside it
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const sentTo = { email: false, phone: !!pendingUser.phone };

    // If user has phone → SMS via Firebase on frontend (primary)
    // If no phone → email OTP as fallback
    if (!pendingUser.phone && pendingUser.email) {
      try {
        await sendOtpEmail(pendingUser.email, pendingUser.name, otp);
        sentTo.email = true;
      } catch (err) {
        console.error(`📧 OTP email failed for ${pendingUser.email}:`, err.message);
      }
    }

    authOtpStore.set(pendingId, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
      type: 'register',
      pendingUser,
    });

    console.log(`🔐 Register OTP for ${name} (${pendingId}): ${otp}`);

    res.status(200).json({
      requiresOtp: true,
      userId: pendingId,
      sentTo,
      phone: pendingUser.phone,
      message: 'Please verify with the OTP to complete registration.',
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
        // ADMIN users bypass OTP — go straight to JWT
        if (user.role === 'ADMIN') {
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

        // CLIENT users require OTP verification
        // Use the same channel they logged in with
        const { sentTo, phone } = await generateAndSendAuthOtp(user.id, user, 'login', {
          preferEmail: isEmail,
          preferPhone: !isEmail,
        });
        return res.json({
          requiresOtp: true,
          userId: user.id,
          sentTo,
          phone,
          message: 'OTP sent to your email/phone. Please verify to continue.',
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

    // Send reset code via email if the identifier is an email address
    if (isEmail && user.email) {
      sendResetCodeEmail(user.email, user.name, code);
    } else {
      // Phone-based reset — log for now (integrate SMS provider for production)
      console.log(`[RESET CODE] ${emailOrPhone}: ${code}`);
    }

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

/**
 * POST /auth/verify-auth-otp
 * Verifies the 6-digit OTP sent during login or registration.
 *
 * On success:
 *  - For registration: marks the user as verified, sends welcome email, returns JWT.
 *  - For login: returns JWT directly.
 *
 * @param {import('express').Request}  req  - Body: { userId, otp }
 * @param {import('express').Response} res  - 200 with token + user on success.
 * @param {import('express').NextFunction} next
 */
export const verifyAuthOtp = async (req, res, next) => {
  try {
    const { userId, otp } = req.body;
    if (!userId || !otp) return res.status(400).json({ error: 'userId and otp are required' });

    const stored = authOtpStore.get(userId);
    if (!stored || stored.otp !== otp || Date.now() > stored.expiresAt) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Consume the OTP
    authOtpStore.delete(userId);

    let user;

    if (stored.type === 'register' && stored.pendingUser) {
      // Registration: NOW create the account in DB since OTP is verified
      const p = stored.pendingUser;

      // Re-check for duplicates (in case someone registered in the meantime)
      const existing = await prisma.user.findFirst({
        where: { OR: [p.email ? { email: p.email } : {}, p.phone ? { phone: p.phone } : {}].filter(o => Object.keys(o).length > 0) },
      });
      if (existing) return res.status(409).json({ error: 'An account with this email or phone was already created' });

      user = await prisma.user.create({
        data: {
          name: p.name,
          email: p.email,
          phone: p.phone,
          password: p.password,
          barangay: p.barangay,
          address: p.address,
          isVerified: true,
        },
      });
      if (user.email) sendWelcomeEmail(user.email, user.name);
    } else {
      // Login: user already exists in DB
      user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: 'User not found' });
    }

    const token = generateToken(user.id, 'user');
    res.json({
      type: 'user',
      token,
      user: {
        id: user.id, name: user.name, email: user.email, phone: user.phone,
        role: user.role, barangay: user.barangay, language: user.language,
        avatarUrl: user.avatarUrl || null,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/resend-otp
 * Resends the auth OTP for login or registration.
 * Generates a new code and sends to email/phone.
 *
 * @param {import('express').Request}  req  - Body: { userId }
 * @param {import('express').Response} res  - 200 with sentTo info.
 * @param {import('express').NextFunction} next
 */
export const resendAuthOtp = async (req, res, next) => {
  try {
    const { userId, forceEmail } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const existing = authOtpStore.get(userId);
    const type = existing?.type || 'login';

    // For pending registrations, user data is in the OTP store (not in DB)
    let user;
    if (type === 'register' && existing?.pendingUser) {
      user = existing.pendingUser;
    } else {
      user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: 'User not found' });
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const sentTo = { email: false, phone: false };

    // forceEmail = true → SMS failed, fall back to email
    if (forceEmail && user.email) {
      try {
        await sendOtpEmail(user.email, user.name, otp);
        sentTo.email = true;
      } catch (err) {
        console.error(`📧 OTP email failed for ${user.email}:`, err.message);
      }
    } else if (!user.phone && user.email) {
      try {
        await sendOtpEmail(user.email, user.name, otp);
        sentTo.email = true;
      } catch (err) {
        console.error(`📧 OTP email failed for ${user.email}:`, err.message);
      }
    } else {
      sentTo.phone = !!user.phone;
    }

    // Update the store — preserve pendingUser for registrations
    authOtpStore.set(userId, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
      type,
      ...(existing?.pendingUser ? { pendingUser: existing.pendingUser } : {}),
    });

    console.log(`🔐 Resend OTP for ${user.name} (${userId}): ${otp} [${type}]`);
    res.json({ message: 'OTP resent successfully', sentTo, phone: user.phone || null });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/firebase/verify-phone
 * Verifies a Firebase Phone Auth ID token and issues our own JWT.
 *
 * Flow:
 *  1. Frontend uses Firebase SDK to send SMS OTP and verify it.
 *  2. Firebase returns an ID token to the frontend.
 *  3. Frontend sends that token here.
 *  4. We verify it with Firebase Admin SDK, extract the phone number.
 *  5. Look up or create the user in our DB, return our own JWT.
 *
 * @param {import('express').Request}  req  - Body: { idToken }
 * @param {import('express').Response} res  - 200 with token + user on success.
 * @param {import('express').NextFunction} next
 */
export const verifyFirebasePhone = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'Firebase ID token is required' });

    const firebaseAuth = getFirebaseAuth();
    if (!firebaseAuth) {
      return res.status(503).json({ error: 'Firebase is not configured on this server' });
    }

    // Verify the Firebase ID token
    const decoded = await firebaseAuth.verifyIdToken(idToken);
    const phone = decoded.phone_number;

    if (!phone) {
      return res.status(400).json({ error: 'No phone number found in Firebase token' });
    }

    // Normalize PH phone: +639xx → 09xx for DB consistency
    const normalizedPhone = phone.startsWith('+63')
      ? '0' + phone.slice(3)
      : phone;

    // Look up existing user by phone
    let user = await prisma.user.findFirst({
      where: { OR: [{ phone: normalizedPhone }, { phone }] },
    });

    if (!user) {
      // Auto-create a verified account for the phone number
      user = await prisma.user.create({
        data: {
          phone: normalizedPhone,
          name: 'Guest User',
          barangay: 'Unknown',
          isVerified: true,
        },
      });
    }

    const token = generateToken(user.id);
    res.json({
      type: 'user',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        barangay: user.barangay,
        language: user.language,
        avatarUrl: user.avatarUrl || null,
      },
    });
  } catch (err) {
    if (err.code === 'auth/id-token-expired' || err.code === 'auth/argument-error') {
      return res.status(401).json({ error: 'Invalid or expired Firebase token' });
    }
    next(err);
  }
};

/**
 * POST /auth/verify-phone-otp
 * Verifies a Firebase Phone Auth token to complete login/register OTP flow.
 *
 * Used when a citizen chooses "Verify via SMS" instead of entering the email OTP.
 * Validates the Firebase token, checks that the phone matches the pending user,
 * consumes the auth OTP entry, and returns a JWT.
 *
 * @param {import('express').Request}  req  - Body: { userId, idToken }
 * @param {import('express').Response} res  - 200 with token + user on success.
 * @param {import('express').NextFunction} next
 */
export const verifyPhoneOtp = async (req, res, next) => {
  try {
    const { userId, idToken } = req.body;
    if (!userId || !idToken) {
      return res.status(400).json({ error: 'userId and Firebase idToken are required' });
    }

    // Check there is a pending OTP entry for this user
    const stored = authOtpStore.get(userId);
    if (!stored) {
      return res.status(400).json({ error: 'No pending verification found. Please log in again.' });
    }

    // Verify Firebase token
    const firebaseAuth = getFirebaseAuth();
    if (!firebaseAuth) {
      return res.status(503).json({ error: 'Firebase is not configured on this server' });
    }

    const decoded = await firebaseAuth.verifyIdToken(idToken);
    const firebasePhone = decoded.phone_number;
    if (!firebasePhone) {
      return res.status(400).json({ error: 'No phone number in Firebase token' });
    }

    // Normalize Firebase phone to local format
    const normalizedPhone = firebasePhone.startsWith('+63') ? '0' + firebasePhone.slice(3) : firebasePhone;

    let user;

    if (stored.type === 'register' && stored.pendingUser) {
      // Registration: verify phone matches pending data, then create account
      const p = stored.pendingUser;
      if (p.phone !== normalizedPhone && p.phone !== firebasePhone) {
        return res.status(400).json({ error: 'Phone number does not match your registration' });
      }

      // Re-check for duplicates
      const existing = await prisma.user.findFirst({
        where: { OR: [p.email ? { email: p.email } : {}, p.phone ? { phone: p.phone } : {}].filter(o => Object.keys(o).length > 0) },
      });
      if (existing) return res.status(409).json({ error: 'An account with this email or phone was already created' });

      user = await prisma.user.create({
        data: {
          name: p.name, email: p.email, phone: p.phone,
          password: p.password, barangay: p.barangay, address: p.address,
          isVerified: true,
        },
      });
      if (user.email) sendWelcomeEmail(user.email, user.name);
    } else {
      // Login: user already exists
      user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (user.phone !== normalizedPhone && user.phone !== firebasePhone) {
        return res.status(400).json({ error: 'Phone number does not match your account' });
      }
    }

    // Consume the OTP entry
    authOtpStore.delete(userId);

    const token = generateToken(user.id, 'user');
    res.json({
      type: 'user',
      token,
      user: {
        id: user.id, name: user.name, email: user.email, phone: user.phone,
        role: user.role, barangay: user.barangay, language: user.language,
        avatarUrl: user.avatarUrl || null,
      },
    });
  } catch (err) {
    if (err.code === 'auth/id-token-expired' || err.code === 'auth/argument-error') {
      return res.status(401).json({ error: 'Invalid or expired Firebase token' });
    }
    next(err);
  }
};
