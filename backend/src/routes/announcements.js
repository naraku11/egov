/**
 * @file announcements.js
 * @description Express router for the announcement resource.
 *
 * Announcements are official notices published by government administrators
 * to inform citizens about events, policy changes, or service updates.
 *
 * Route summary
 * ─────────────────────────────────────────────────────────────────────────────
 * Public (no authentication required):
 *   GET    /        – List all published announcements, with optional category filter
 *   GET    /:id     – Retrieve a single announcement by ID
 *
 * Admin-only (requires authentication + admin role):
 *   GET    /all     – List every announcement, including unpublished drafts
 *   POST   /        – Create a new announcement
 *   PUT    /:id     – Update an existing announcement
 *   DELETE /:id     – Permanently delete an announcement
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Database access is performed directly via the Prisma client (no separate
 * controller layer). Errors are forwarded to the global error handler via
 * `next(err)`.
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

/** Dedicated Express router instance for all /announcements endpoints. */
const router = Router();

/**
 * GET /
 * Return all published announcements, ordered newest-first.
 * Accepts an optional `category` query parameter to filter results.
 * Passing `category=ALL` (or omitting it entirely) returns every category.
 *
 * @name GetPublishedAnnouncements
 * @access Public
 * @queryparam {string} [category] – Category slug to filter by (e.g. "INFO", "ALERT")
 */
router.get('/', async (req, res, next) => {
  try {
    const { category } = req.query;

    // Base filter: only return announcements that have been published
    const where = { isPublished: true };

    // Narrow by category when a specific one is requested
    if (category && category !== 'ALL') where.category = category;

    const announcements = await prisma.announcement.findMany({
      where,
      orderBy: { createdAt: 'desc' }, // newest announcements first
    });
    res.json(announcements);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /all
 * Return every announcement regardless of published state.
 * Intended for the admin dashboard to manage drafts and published entries.
 *
 * @name GetAllAnnouncements
 * @access Admin only
 * @middleware authenticate
 * @middleware requireAdmin
 */
router.get('/all', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const announcements = await prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' }, // newest first
    });
    res.json(announcements);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /:id
 * Retrieve a single announcement by its unique ID.
 * Returns 404 if the announcement does not exist.
 *
 * @name GetAnnouncement
 * @access Public
 * @param {string} id – Prisma CUID of the announcement
 */
router.get('/:id', async (req, res, next) => {
  try {
    const announcement = await prisma.announcement.findUnique({
      where: { id: req.params.id },
    });

    // Guard: return a clear 404 rather than null
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });

    res.json(announcement);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /
 * Create a new announcement.
 * The `isPublished` flag defaults to `true` when not explicitly set to `false`,
 * so omitting it will immediately publish the announcement.
 * `publishedAt` is stamped with the current timestamp on first publication.
 *
 * @name CreateAnnouncement
 * @access Admin only
 * @middleware authenticate
 * @middleware requireAdmin
 * @bodyparam {string}  title       – Announcement headline (required)
 * @bodyparam {string}  content     – Full announcement body text (required)
 * @bodyparam {string}  [category]  – Category slug; defaults to "INFO"
 * @bodyparam {boolean} [isPublished] – Whether to publish immediately; defaults to true
 */
router.post('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { title, content, category, isPublished } = req.body;

    // Both title and content are mandatory fields
    if (!title || !content) return res.status(400).json({ error: 'Title and content are required' });

    // Default to published unless the caller explicitly passes false
    const publish = isPublished !== false;

    const announcement = await prisma.announcement.create({
      data: {
        title,
        content,
        category:    category || 'INFO',   // fall back to generic INFO category
        isPublished: publish,
        publishedAt: publish ? new Date() : null, // record when it went live
        createdById: req.user.id,               // track which admin created it
      },
    });
    res.status(201).json(announcement);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /:id
 * Update an existing announcement.
 * Only fields present in the request body are modified (partial update pattern).
 * `publishedAt` is set the first time `isPublished` is flipped to `true`;
 * it is cleared when `isPublished` is set to `false`.
 *
 * @name UpdateAnnouncement
 * @access Admin only
 * @middleware authenticate
 * @middleware requireAdmin
 * @param   {string}  id            – CUID of the announcement to update
 * @bodyparam {string}  [title]
 * @bodyparam {string}  [content]
 * @bodyparam {string}  [category]
 * @bodyparam {boolean} [isPublished]
 */
router.put('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { title, content, category, isPublished } = req.body;

    // Build a partial update object; undefined fields are ignored by Prisma
    const data = {
      title:       title       ?? undefined,
      content:     content     ?? undefined,
      category:    category    ?? undefined,
      isPublished: isPublished ?? undefined,
    };

    // Set publishedAt the first time an announcement is published
    if (isPublished === true) {
      // Only stamp publishedAt if it has never been set before
      const existing = await prisma.announcement.findUnique({ where: { id: req.params.id }, select: { publishedAt: true } });
      if (!existing?.publishedAt) data.publishedAt = new Date();
    } else if (isPublished === false) {
      // Clear the timestamp when the announcement is un-published
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

/**
 * DELETE /:id
 * Permanently remove an announcement from the database.
 *
 * @name DeleteAnnouncement
 * @access Admin only
 * @middleware authenticate
 * @middleware requireAdmin
 * @param {string} id – CUID of the announcement to delete
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    await prisma.announcement.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
