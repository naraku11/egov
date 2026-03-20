import { Router } from 'express';
import prisma from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticate, requireAdmin, requireServant } from '../middleware/auth.js';
import { avatarUpload } from '../middleware/upload.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Get servant stats
router.get('/stats', authenticate, requireServant, async (req, res, next) => {
  try {
    const servantId = req.servant.id;
    const [total, pending, inProgress, resolved, urgent, servantRecord] = await Promise.all([
      prisma.ticket.count({ where: { servantId } }),
      prisma.ticket.count({ where: { servantId, status: 'PENDING' } }),
      prisma.ticket.count({ where: { servantId, status: 'IN_PROGRESS' } }),
      prisma.ticket.count({ where: { servantId, status: 'RESOLVED' } }),
      prisma.ticket.count({ where: { servantId, priority: 'URGENT', status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
      prisma.servant.findUnique({ where: { id: servantId }, select: { status: true } }),
    ]);

    const avgRating = await prisma.feedback.aggregate({
      where: { ticket: { servantId } },
      _avg: { rating: true },
      _count: true,
    });

    res.json({
      total, pending, inProgress, resolved, urgent,
      status: servantRecord?.status || 'AVAILABLE',
      avgRating: avgRating._avg.rating,
      totalRatings: avgRating._count,
    });
  } catch (err) {
    next(err);
  }
});

// Heartbeat — called every 60 s by the servant's browser to keep lastActiveAt fresh
router.patch('/heartbeat', authenticate, requireServant, async (req, res, next) => {
  try {
    await prisma.servant.update({
      where: { id: req.servant.id },
      data: { lastActiveAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Update servant status
router.patch('/status', authenticate, requireServant, async (req, res, next) => {
  try {
    const { status } = req.body;
    const updated = await prisma.servant.update({
      where: { id: req.servant.id },
      data: { status, lastActiveAt: new Date() },
    });
    res.json({ status: updated.status });
  } catch (err) {
    next(err);
  }
});

// Admin: list all servants
router.get('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const servants = await prisma.servant.findMany({
      include: {
        department: { select: { name: true, code: true, color: true } },
        _count: { select: { tickets: true } },
      },
      orderBy: { name: 'asc' },
    });
    const result = servants.map(({ password: _, ...s }) => s);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Admin: create servant
router.post('/', authenticate, requireAdmin, avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    const { name, email, position, phone, departmentId, password } = req.body;
    const hashedPassword = await bcrypt.hash(password || 'servant123', 10);
    const avatarUrl = req.file ? `/uploads/avatars/${req.file.filename}` : null;

    const servant = await prisma.servant.create({
      data: { name, email, position, phone, departmentId, password: hashedPassword, avatarUrl },
      include: { department: true },
    });
    const { password: _, ...data } = servant;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// Admin: update servant
router.put('/:id', authenticate, requireAdmin, avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    const { password, ...data } = req.body;
    const updateData = { ...data };
    if (password) updateData.password = await bcrypt.hash(password, 10);

    if (req.file) {
      // Delete old avatar if present
      const existing = await prisma.servant.findUnique({ where: { id: req.params.id }, select: { avatarUrl: true } });
      if (existing?.avatarUrl) {
        const oldPath = path.join(__dirname, '..', '..', existing.avatarUrl);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      updateData.avatarUrl = `/uploads/avatars/${req.file.filename}`;
    }

    const servant = await prisma.servant.update({
      where: { id: req.params.id },
      data: updateData,
      include: { department: true },
    });
    const { password: _, ...result } = servant;
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Admin: delete servant
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    // Unassign open tickets before deleting
    await prisma.ticket.updateMany({
      where: { servantId: req.params.id, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      data: { servantId: null, status: 'PENDING' },
    });
    await prisma.servant.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
