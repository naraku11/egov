import prisma from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const generateToken = (id, type = 'user') => {
  return jwt.sign({ id, type }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// In-memory OTP store (use Redis in production)
const otpStore = new Map();

// In-memory password-reset token store
const resetStore = new Map();

export const register = async (req, res, next) => {
  try {
    const { name, email, phone, password, barangay, address } = req.body;

    if (!name || !barangay) {
      return res.status(400).json({ error: 'Name and barangay are required' });
    }
    if (!email && !phone) {
      return res.status(400).json({ error: 'Email or phone is required' });
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [email ? { email } : {}, phone ? { phone } : {}].filter(o => Object.keys(o).length > 0) },
    });
    if (existing) {
      return res.status(409).json({ error: 'User already exists with this email or phone' });
    }

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

export const login = async (req, res, next) => {
  try {
    const { email, phone, password } = req.body;

    if (!password) return res.status(400).json({ error: 'Password is required' });
    if (!email && !phone) return res.status(400).json({ error: 'Email or phone is required' });

    const user = await prisma.user.findFirst({
      where: email ? { email } : { phone },
    });

    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

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

export const servantLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const servant = await prisma.servant.findUnique({
      where: { email },
      include: { department: true },
    });

    if (!servant) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, servant.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    await prisma.servant.update({ where: { id: servant.id }, data: { lastActiveAt: new Date() } });

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

export const getProfile = async (req, res) => {
  if (req.userType === 'servant') {
    const { password: _, ...servant } = req.servant;
    return res.json({ servant, type: 'servant' });
  }
  const { password: _, ...user } = req.user;
  res.json({ user, type: 'user' });
};

export const updateProfile = async (req, res, next) => {
  try {
    const { name, address, language, barangay, phone, position, currentPassword, newPassword } = req.body;

    // Resolve new avatar URL if a file was uploaded
    let avatarUrl;
    if (req.file) {
      avatarUrl = `/uploads/avatars/${req.file.filename}`;
    }

    // Helper: delete old avatar file from disk
    const deleteOldAvatar = (oldUrl) => {
      if (!oldUrl || oldUrl.startsWith('http')) return;
      try {
        const filePath = path.join(process.cwd(), oldUrl);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch { /* ignore */ }
    };

    if (req.userType === 'servant') {
      if (newPassword) {
        if (!currentPassword) return res.status(400).json({ error: 'Current password is required to set a new one' });
        if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
        const record = await prisma.servant.findUnique({ where: { id: req.servant.id } });
        const valid = await bcrypt.compare(currentPassword, record.password);
        if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
      }

      if (avatarUrl && req.servant.avatarUrl) deleteOldAvatar(req.servant.avatarUrl);

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

    // User (resident / admin)
    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'Current password is required to set a new one' });
      if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
      if (!req.user.password) return res.status(400).json({ error: 'No password set for this account' });
      const valid = await bcrypt.compare(currentPassword, req.user.password);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    }

    if (avatarUrl && req.user.avatarUrl) deleteOldAvatar(req.user.avatarUrl);

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
    const { password: _, ...result } = updated;
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const requestOtp = async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone is required' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

  // In production: send via Twilio
  console.log(`OTP for ${phone}: ${otp}`);
  res.json({ message: 'OTP sent successfully' });
};

export const verifyOtp = async (req, res, next) => {
  try {
    const { phone, otp } = req.body;
    const stored = otpStore.get(phone);

    if (!stored || stored.otp !== otp || Date.now() > stored.expiresAt) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    otpStore.delete(phone);

    let user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
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

// Unified login — checks users first, then servants
export const unifiedLogin = async (req, res, next) => {
  try {
    const { emailOrPhone, password } = req.body;
    if (!emailOrPhone || !password) {
      return res.status(400).json({ error: 'Email/phone and password are required' });
    }

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

    // 2. Try Servant table (email only)
    if (isEmail) {
      const servant = await prisma.servant.findUnique({
        where: { email: emailOrPhone },
        include: { department: true },
      });

      if (servant) {
        const valid = await bcrypt.compare(password, servant.password);
        if (valid) {
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

    return res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) {
    next(err);
  }
};

// Send a 6-digit reset code to the resident's email or phone (logged to console in dev)
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

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    resetStore.set(emailOrPhone, { code, userId: user.id, expiresAt: Date.now() + 15 * 60 * 1000 });

    // In production: send via email or SMS. For now, log to console.
    console.log(`[RESET CODE] ${emailOrPhone}: ${code}`);

    res.json({ message: 'If an account exists, a reset code has been sent' });
  } catch (err) {
    next(err);
  }
};

// Verify reset code and set new password
export const resetPassword = async (req, res, next) => {
  try {
    const { emailOrPhone, code, newPassword } = req.body;
    if (!emailOrPhone || !code || !newPassword) {
      return res.status(400).json({ error: 'emailOrPhone, code, and newPassword are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const stored = resetStore.get(emailOrPhone);
    if (!stored || stored.code !== code || Date.now() > stored.expiresAt) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    resetStore.delete(emailOrPhone);

    await prisma.user.update({
      where: { id: stored.userId },
      data: { password: await bcrypt.hash(newPassword, 10) },
    });

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
};
