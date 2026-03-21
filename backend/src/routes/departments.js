/**
 * @file departments.js
 * @description Express router for the department resource.
 *
 * Departments represent the organisational units of the government entity
 * (e.g. "Civil Registration", "Revenue", "Health Services"). Each department
 * can have many civil servants assigned to it, and tickets are routed to
 * departments for processing.
 *
 * Route summary
 * ─────────────────────────────────────────────────────────────────────────────
 * Public (no authentication required):
 *   GET    /        – List all active departments (with servant & ticket counts)
 *   GET    /:id     – Retrieve a single department with its assigned servants
 *
 * Admin-only (requires authentication + admin role):
 *   POST   /        – Create a new department
 *   PUT    /:id     – Update an existing department's details
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Note: delete is intentionally omitted to prevent accidental data loss;
 * departments should be deactivated (isActive = false) rather than deleted.
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

/** Dedicated Express router instance for all /departments endpoints. */
const router = Router();

/**
 * GET /
 * Return all active departments, ordered alphabetically by name.
 * Each result includes a `_count` aggregate with the number of assigned
 * servants and open tickets, useful for dashboard summaries.
 *
 * @name GetDepartments
 * @access Public
 */
router.get('/', async (req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      where: { isActive: true }, // exclude soft-deleted / inactive departments
      include: {
        // Attach counts of related records without fetching their full data
        _count: { select: { servants: true, tickets: true } },
      },
      orderBy: { name: 'asc' }, // alphabetical listing
    });
    res.json(departments);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /:id
 * Retrieve a single department by its unique ID.
 * Returns 404 if the department does not exist.
 * The response includes the department's servant list (id, name, position,
 * status) and the total number of tickets it has received.
 *
 * @name GetDepartment
 * @access Public
 * @param {string} id – Prisma CUID of the department
 */
router.get('/:id', async (req, res, next) => {
  try {
    const dept = await prisma.department.findUnique({
      where: { id: req.params.id },
      include: {
        // Return a lightweight servant list for the department detail view
        servants: { select: { id: true, name: true, position: true, status: true } },
        // Include the ticket count aggregate alongside the servant list
        _count: { select: { tickets: true } },
      },
    });

    // Guard: return a clear 404 rather than null
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    res.json(dept);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /
 * Create a new department.
 * The full request body is passed directly as Prisma `data`, so the caller
 * must supply all required schema fields (name, code, etc.).
 *
 * @name CreateDepartment
 * @access Admin only
 * @middleware authenticate
 * @middleware requireAdmin
 * @bodyparam {object} body – Department fields as defined by the Prisma schema
 */
router.post('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const dept = await prisma.department.create({ data: req.body });
    res.status(201).json(dept); // 201 Created
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /:id
 * Update an existing department's details.
 * The full request body is forwarded to Prisma, supporting partial updates
 * since Prisma ignores undefined fields when an explicit partial-update
 * pattern is used by the caller.
 *
 * @name UpdateDepartment
 * @access Admin only
 * @middleware authenticate
 * @middleware requireAdmin
 * @param   {string} id   – CUID of the department to update
 * @bodyparam {object} body – Fields to update on the department record
 */
router.put('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const dept = await prisma.department.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    res.json(dept);
  } catch (err) {
    next(err);
  }
});

export default router;
