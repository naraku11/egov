/**
 * @file directory.js
 * @description Express router for the government contact directory resource.
 *
 * The directory is a publicly browsable list of government officials, offices,
 * and service points. Each entry contains contact details (phone, email,
 * address, office hours) and is grouped by category (e.g. OFFICIAL, OFFICE).
 *
 * Route summary
 * ─────────────────────────────────────────────────────────────────────────────
 * Public (no authentication required):
 *   GET    /        – List all active directory entries, with optional category filter
 *
 * Admin-only (requires authentication + admin role):
 *   GET    /all     – List every entry including inactive ones
 *   POST   /        – Create a new directory entry
 *   PUT    /:id     – Update an existing directory entry
 *   DELETE /:id     – Permanently delete a directory entry
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Results are ordered by category then by name so that the public-facing
 * directory renders in a logical, grouped order.
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

/** Dedicated Express router instance for all /directory endpoints. */
const router = Router();

/**
 * GET /all
 * Return every directory entry regardless of active state.
 * Intended for the admin management panel where inactive entries must
 * still be visible and editable.
 * NOTE: Must be defined BEFORE GET /:id so Express doesn't treat "all" as an :id param.
 *
 * @name GetAllDirectoryEntries
 * @access Admin only
 * @middleware authenticate
 * @middleware requireAdmin
 */
router.get('/all', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const entries = await prisma.directoryEntry.findMany({
      // Same ordering as the public endpoint for consistency
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    res.json(entries);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /
 * Return all active directory entries, ordered by category then by name.
 * Accepts an optional `category` query parameter to filter the results.
 * Passing `category=ALL` (or omitting it) returns every category.
 *
 * @name GetDirectoryEntries
 * @access Public
 * @queryparam {string} [category] – Category to filter by (e.g. "OFFICIAL", "OFFICE")
 */
router.get('/', async (req, res, next) => {
  try {
    const { category } = req.query;

    // Base filter: only expose entries that are currently active
    const where = { isActive: true };

    // Narrow by category when a specific one is requested
    if (category && category !== 'ALL') where.category = category;

    const entries = await prisma.directoryEntry.findMany({
      where,
      // Primary sort: group entries by category; secondary: alphabetical within each group
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    res.json(entries);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /
 * Create a new directory entry.
 * Optional fields (department, address, phone, email, officeHours) default
 * to null when not supplied. Category defaults to "OFFICIAL".
 * `isActive` defaults to true unless explicitly passed as false.
 *
 * @name CreateDirectoryEntry
 * @access Admin only
 * @middleware authenticate
 * @middleware requireAdmin
 * @bodyparam {string}  name          – Full name or title of the official/office (required)
 * @bodyparam {string}  position      – Job title or role (required)
 * @bodyparam {string}  [department]  – Department name or affiliation
 * @bodyparam {string}  [address]     – Physical address
 * @bodyparam {string}  [phone]       – Contact phone number
 * @bodyparam {string}  [email]       – Contact email address
 * @bodyparam {string}  [officeHours] – Human-readable office hours string
 * @bodyparam {string}  [category]    – Entry category; defaults to "OFFICIAL"
 * @bodyparam {boolean} [isActive]    – Whether the entry is publicly visible; defaults to true
 */
router.post('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { name, position, department, address, phone, email, officeHours, category, isActive } = req.body;

    // name and position are the minimum required identifiers for a directory entry
    if (!name || !position) return res.status(400).json({ error: 'Name and position are required' });

    const entry = await prisma.directoryEntry.create({
      data: {
        name,
        position,
        department:  department  || null,   // optional — null when not provided
        address:     address     || null,
        phone:       phone       || null,
        email:       email       || null,
        officeHours: officeHours || null,
        category:    category    || 'OFFICIAL', // default category for government officials
        isActive:    isActive    !== false,     // active by default unless explicitly false
      },
    });
    res.status(201).json(entry); // 201 Created
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /:id
 * Update an existing directory entry.
 * Only fields present in the request body are modified; absent fields are
 * left unchanged (using the `?? undefined` pattern so Prisma skips them).
 *
 * @name UpdateDirectoryEntry
 * @access Admin only
 * @middleware authenticate
 * @middleware requireAdmin
 * @param   {string}  id            – CUID of the directory entry to update
 * @bodyparam {string}  [name]
 * @bodyparam {string}  [position]
 * @bodyparam {string}  [department]
 * @bodyparam {string}  [address]
 * @bodyparam {string}  [phone]
 * @bodyparam {string}  [email]
 * @bodyparam {string}  [officeHours]
 * @bodyparam {string}  [category]
 * @bodyparam {boolean} [isActive]
 */
router.put('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { name, position, department, address, phone, email, officeHours, category, isActive } = req.body;

    const entry = await prisma.directoryEntry.update({
      where: { id: req.params.id },
      data: {
        // `?? undefined` ensures Prisma skips fields the caller did not supply
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

/**
 * DELETE /:id
 * Permanently remove a directory entry from the database.
 * Consider setting `isActive = false` instead if a soft-delete is preferred.
 *
 * @name DeleteDirectoryEntry
 * @access Admin only
 * @middleware authenticate
 * @middleware requireAdmin
 * @param {string} id – CUID of the directory entry to delete
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    await prisma.directoryEntry.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
