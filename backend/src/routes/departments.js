import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Get all departments (public)
router.get('/', async (req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      where: { isActive: true },
      include: { _count: { select: { servants: true, tickets: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(departments);
  } catch (err) {
    next(err);
  }
});

// Get department by ID
router.get('/:id', async (req, res, next) => {
  try {
    const dept = await prisma.department.findUnique({
      where: { id: req.params.id },
      include: {
        servants: { select: { id: true, name: true, position: true, status: true } },
        _count: { select: { tickets: true } },
      },
    });
    if (!dept) return res.status(404).json({ error: 'Department not found' });
    res.json(dept);
  } catch (err) {
    next(err);
  }
});

// Admin: create/update/delete departments
router.post('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const dept = await prisma.department.create({ data: req.body });
    res.status(201).json(dept);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const dept = await prisma.department.update({ where: { id: req.params.id }, data: req.body });
    res.json(dept);
  } catch (err) {
    next(err);
  }
});

export default router;
