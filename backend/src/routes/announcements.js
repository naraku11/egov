import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Public: get all published announcements
router.get('/', async (req, res, next) => {
  try {
    const { category } = req.query;
    const where = { isPublished: true };
    if (category && category !== 'ALL') where.category = category;

    const announcements = await prisma.announcement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json(announcements);
  } catch (err) {
    next(err);
  }
});

// Admin: get all announcements including unpublished
router.get('/all', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const announcements = await prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(announcements);
  } catch (err) {
    next(err);
  }
});

// Public: get single announcement
router.get('/:id', async (req, res, next) => {
  try {
    const announcement = await prisma.announcement.findUnique({
      where: { id: req.params.id },
    });
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });
    res.json(announcement);
  } catch (err) {
    next(err);
  }
});

// Admin: create announcement
router.post('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { title, content, category, isPublished } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content are required' });

    const publish = isPublished !== false;
    const announcement = await prisma.announcement.create({
      data: {
        title,
        content,
        category: category || 'INFO',
        isPublished: publish,
        publishedAt: publish ? new Date() : null,
        createdById: req.user.id,
      },
    });
    res.status(201).json(announcement);
  } catch (err) {
    next(err);
  }
});

// Admin: update announcement
router.put('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { title, content, category, isPublished } = req.body;

    const data = {
      title:       title       ?? undefined,
      content:     content     ?? undefined,
      category:    category    ?? undefined,
      isPublished: isPublished ?? undefined,
    };

    // Set publishedAt the first time an announcement is published
    if (isPublished === true) {
      const existing = await prisma.announcement.findUnique({ where: { id: req.params.id }, select: { publishedAt: true } });
      if (!existing?.publishedAt) data.publishedAt = new Date();
    } else if (isPublished === false) {
      data.publishedAt = null;
    }

    const announcement = await prisma.announcement.update({
      where: { id: req.params.id },
      data,
    });
    res.json(announcement);
  } catch (err) {
    next(err);
  }
});

// Admin: delete announcement
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    await prisma.announcement.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
