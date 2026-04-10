/**
 * @file servants.js
 * @description Express router for the civil servant (staff) resource.
 *
 * Civil servants are the government employees who process citizen service
 * requests (tickets). This router covers two distinct concerns:
 *
 *   1. Self-service servant endpoints – a logged-in servant can view their
 *      own performance stats, update their availability status, and send
 *      periodic heartbeats to keep their "last active" timestamp current.
 *
 *   2. Admin management endpoints – administrators can create, list, update,
 *      and delete servant accounts, including avatar uploads.
 *
 * Route summary
 * ─────────────────────────────────────────────────────────────────────────────
 * Servant-only (requires authentication + servant role):
 *   GET    /stats       – Fetch ticket counts, average rating and current status
 *   PATCH  /heartbeat   – Refresh lastActiveAt (called ~every 60 s by the client)
 *   PATCH  /status      – Update own availability status (AVAILABLE, BUSY, etc.)
 *
 * Admin-only (requires authentication + admin role):
 *   GET    /            – List all servants with department info and ticket count
 *   POST   /            – Create a new servant account (supports avatar upload)
 *   PUT    /:id         – Update a servant's details (supports avatar replacement)
 *   DELETE /:id         – Delete a servant, re-queuing their open tickets
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Passwords are hashed with bcrypt (cost factor 10) before storage and are
 * stripped from all response payloads via destructuring.
 * Avatar images are stored under /uploads/avatars/ by the `avatarUpload`
 * multer middleware; old avatars are removed from disk on replacement.
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticate, requireAdmin, requireServant } from '../middleware/auth.js';
import { avatarUpload } from '../middleware/upload.js';
import { getIO } from '../lib/socket.js';

// Resolve __dirname for ES module context (not available natively in ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Dedicated Express router instance for all /servants endpoints. */
const router = Router();

// ─── Servant self-service routes ─────────────────────────────────────────────

/**
 * GET /stats
 * Return performance statistics for the currently logged-in servant.
 * Uses `Promise.all` to fire all count queries in parallel for efficiency.
 *
 * Response shape:
 * ```json
 * {
 *   "total": 42,        // all-time assigned tickets
 *   "pending": 5,       // tickets awaiting action
 *   "inProgress": 3,    // tickets actively being handled
 *   "resolved": 34,     // completed tickets
 *   "urgent": 2,        // open tickets flagged as URGENT
 *   "status": "AVAILABLE",
 *   "avgRating": 4.7,   // mean satisfaction score (1–5)
 *   "totalRatings": 28  // number of feedback submissions
 * }
 * ```
 *
 * @name GetServantStats
 * @access Servant only
 * @middleware authenticate
 * @middleware requireServant
 */
router.get('/stats', authenticate, requireServant, async (req, res, next) => {
  try {
    const servantId = req.servant.id;

    // Run all Prisma count queries concurrently to minimise response time
    const [total, pending, inProgress, resolved, urgent, servantRecord] = await Promise.all([
      prisma.ticket.count({ where: { servantId } }),
      prisma.ticket.count({ where: { servantId, status: 'PENDING' } }),
      prisma.ticket.count({ where: { servantId, status: 'IN_PROGRESS' } }),
      prisma.ticket.count({ where: { servantId, status: 'RESOLVED' } }),
      // Urgent: only count tickets that are still open (not resolved or closed)
      prisma.ticket.count({ where: { servantId, priority: 'URGENT', status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
      // Fetch the servant's current availability status
      prisma.servant.findUnique({ where: { id: servantId }, select: { status: true } }),
    ]);

    // Compute average rating across all feedback linked to this servant's tickets
    const avgRating = await prisma.feedback.aggregate({
      where:  { ticket: { servantId } },
      _avg:   { rating: true },
      _count: true,
    });

    res.json({
      total, pending, inProgress, resolved, urgent,
      status:       servantRecord?.status || 'AVAILABLE', // default if record missing
      avgRating:    avgRating._avg.rating,
      totalRatings: avgRating._count,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /heartbeat
 * Refresh the servant's `lastActiveAt` timestamp.
 * The frontend calls this endpoint approximately every 60 seconds so that
 * the system can accurately track whether a servant is still online and
 * display real-time availability to admins.
 *
 * @name ServantHeartbeat
 * @access Servant only
 * @middleware authenticate
 * @middleware requireServant
 */
router.patch('/heartbeat', authenticate, requireServant, async (req, res, next) => {
  try {
    await prisma.servant.update({
      where: { id: req.servant.id },
      data:  { lastActiveAt: new Date() }, // stamp current time as the last active moment
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /status
 * Allow a servant to update their own availability status
 * (e.g. AVAILABLE → BUSY → OFFLINE).
 * `lastActiveAt` is also refreshed to record the moment of the status change.
 *
 * @name UpdateServantStatus
 * @access Servant only
 * @middleware authenticate
 * @middleware requireServant
 * @bodyparam {string} status – New availability status value
 */
router.patch('/status', authenticate, requireServant, async (req, res, next) => {
  try {
    const { status } = req.body;
    const updated = await prisma.servant.update({
      where: { id: req.servant.id },
      data:  { status, lastActiveAt: new Date() },
    });
    try { getIO()?.to('admin').emit('servant:statusUpdate', { servantId: req.servant.id, status: updated.status }); } catch {}
    res.json({ status: updated.status });
  } catch (err) {
    next(err);
  }
});

// ─── Admin management routes ──────────────────────────────────────────────────

/**
 * GET /
 * Return all servant accounts with their department and total ticket count.
 * The `password` field is stripped from every record before sending the
 * response to ensure credentials are never exposed via the API.
 *
 * @name GetServants
 * @access Admin only
 * @middleware authenticate
 * @middleware requireAdmin
 */
router.get('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const servants = await prisma.servant.findMany({
      include: {
        department: { select: { name: true, code: true, color: true } },
        _count: { select: { tickets: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Fetch all feedback for these servants' tickets in one query
    const servantIds = servants.map(s => s.id);
    const feedbackRows = await prisma.feedback.findMany({
      where:  { ticket: { servantId: { in: servantIds } } },
      select: { rating: true, ticket: { select: { servantId: true } } },
    });

    // Aggregate ratings per servant in JS (avoids N+1 queries)
    const ratingMap = {};
    for (const f of feedbackRows) {
      const sid = f.ticket.servantId;
      if (!ratingMap[sid]) ratingMap[sid] = { sum: 0, count: 0 };
      ratingMap[sid].sum   += f.rating;
      ratingMap[sid].count += 1;
    }

    const result = servants.map(({ password: _, ...s }) => ({
      ...s,
      avgRating:    ratingMap[s.id] ? +(ratingMap[s.id].sum / ratingMap[s.id].count).toFixed(1) : null,
      totalRatings: ratingMap[s.id]?.count || 0,
    }));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /
 * Create a new civil servant account.
 * Accepts an optional avatar image via multipart/form-data (`avatar` field).
 * If no password is provided, a default of "servant123" is used — callers
 * should always supply an explicit password in production.
 *
 * @name CreateServant
 * @access Admin only
 * @middleware authenticate
 * @middleware requireAdmin
 * @middleware avatarUpload.single – parses a single "avatar" file upload
 * @bodyparam {string} name         – Full name of the servant
 * @bodyparam {string} email        – Login email address
 * @bodyparam {string} position     – Job title
 * @bodyparam {string} [phone]      – Contact phone number
 * @bodyparam {string} departmentId – CUID of the assigned department
 * @bodyparam {string} [password]   – Plain-text password (hashed before storage); defaults to "servant123"
 */
router.post('/', authenticate, requireAdmin, avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    const { name, email, position, phone, departmentId, password } = req.body;

    // Hash the password with bcrypt (cost factor 10) before persisting
    const hashedPassword = await bcrypt.hash(password || 'servant123', 10);

    // Build the avatar URL from the uploaded file path, or leave null if no file was sent
    const avatarUrl = req.file ? `/uploads/avatars/${req.file.filename}` : null;

    const servant = await prisma.servant.create({
      data: { name, email, position, phone, departmentId, password: hashedPassword, avatarUrl },
      include: { department: true }, // return department details in the response
    });

    // Strip the hashed password before sending the response
    const { password: _, ...data } = servant;
    res.status(201).json(data); // 201 Created
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /:id
 * Update an existing servant's account details.
 * Supports optional avatar replacement — if a new file is uploaded, the
 * previous avatar is deleted from disk before the new path is stored.
 * If a new `password` is supplied it is hashed; otherwise the existing
 * password hash is left untouched.
 *
 * @name UpdateServant
 * @access Admin only
 * @middleware authenticate
 * @middleware requireAdmin
 * @middleware avatarUpload.single – parses a single "avatar" file upload
 * @param   {string} id – CUID of the servant to update
 * @bodyparam {string} [name]
 * @bodyparam {string} [email]
 * @bodyparam {string} [position]
 * @bodyparam {string} [phone]
 * @bodyparam {string} [departmentId]
 * @bodyparam {string} [password] – New plain-text password (will be hashed)
 */
router.put('/:id', authenticate, requireAdmin, avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    // Separate the password from the rest of the body so it can be hashed independently
    const { password, ...data } = req.body;
    const updateData = { ...data };

    // Only update the password hash when a new password was explicitly provided
    if (password) updateData.password = await bcrypt.hash(password, 10);

    if (req.file) {
      // Delete old avatar if present
      const existing = await prisma.servant.findUnique({
        where:  { id: req.params.id },
        select: { avatarUrl: true },
      });

      if (existing?.avatarUrl) {
        // Construct the absolute filesystem path to the old avatar file
        const oldPath = path.join(__dirname, '..', '..', existing.avatarUrl);
        // Remove the file from disk if it still exists (avoids orphaned files)
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      // Store the relative URL of the newly uploaded avatar
      updateData.avatarUrl = `/uploads/avatars/${req.file.filename}`;
    }

    const servant = await prisma.servant.update({
      where:   { id: req.params.id },
      data:    updateData,
      include: { department: true }, // return updated department details
    });

    // Strip the password hash before returning the updated servant record
    const { password: _, ...result } = servant;
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /:id
 * Delete a servant account.
 * Before deletion, any open tickets assigned to this servant are automatically
 * re-queued: `servantId` is cleared and status is reset to PENDING so that
 * those tickets are not lost or left in a broken assigned state.
 *
 * @name DeleteServant
 * @access Admin only
 * @middleware authenticate
 * @middleware requireAdmin
 * @param {string} id – CUID of the servant to delete
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    // Unassign open tickets before deleting — prevents orphaned ticket assignments
    await prisma.ticket.updateMany({
      where: { servantId: req.params.id, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      data:  { servantId: null, status: 'PENDING' }, // return to the unassigned pool
    });

    await prisma.servant.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
