import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Public: get all active directory entries
router.get('/', async (req, res, next) => {
  try {
    const { category } = req.query;
    const where = { isActive: true };
    if (category && category !== 'ALL') where.category = category;

    const entries = await prisma.directoryEntry.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    res.json(entries);
  } catch (err) {
    next(err);
  }
});

// Admin: get all directory entries including inactive
router.get('/all', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const entries = await prisma.directoryEntry.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    res.json(entries);
  } catch (err) {
    next(err);
  }
});

// Admin: create directory entry
router.post('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { name, position, department, address, phone, email, officeHours, category, isActive } = req.body;
    if (!name || !position) return res.status(400).json({ error: 'Name and position are required' });

    const entry = await prisma.directoryEntry.create({
      data: {
        name,
        position,
        department:  department  || null,
        address:     address     || null,
        phone:       phone       || null,
        email:       email       || null,
        officeHours: officeHours || null,
        category:    category    || 'OFFICIAL',
        isActive:    isActive    !== false,
      },
    });
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

// Admin: update directory entry
router.put('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { name, position, department, address, phone, email, officeHours, category, isActive } = req.body;
    const entry = await prisma.directoryEntry.update({
      where: { id: req.params.id },
      data: {
        name:        name        ?? undefined,
        position:    position    ?? undefined,
        department:  department  ?? undefined,
        address:     address     ?? undefined,
        phone:       phone       ?? undefined,
        email:       email       ?? undefined,
        officeHours: officeHours ?? undefined,
        category:    category    ?? undefined,
        isActive:    isActive    ?? undefined,
      },
    });
    res.json(entry);
  } catch (err) {
    next(err);
  }
});

// Admin: delete directory entry
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    await prisma.directoryEntry.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
