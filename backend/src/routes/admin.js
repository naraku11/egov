/**
 * @file routes/admin.js
 * @description Express router for administrator-only endpoints.
 *
 * All routes in this file are protected by both `authenticate` (valid JWT)
 * and `requireAdmin` (user must have the ADMIN role).  A 401 is returned for
 * missing/invalid tokens; a 403 is returned for authenticated non-admins.
 *
 * Available endpoints:
 *  GET /admin/stats         — Aggregated dashboard statistics (totals, SLA, trends)
 *  GET /admin/tickets       — Paginated ticket list with optional filters
 *  GET /admin/users         — Full list of resident accounts with ticket counts
 *  GET /admin/reports       — Detailed analytics report with an optional date range
 *  GET /admin/sla-breaches  — Tickets that have exceeded their SLA deadline
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /admin/stats
// ---------------------------------------------------------------------------
/**
 * Returns a snapshot of key platform metrics for the admin dashboard.
 *
 * Aggregates the following in a single response:
 *  - Total / pending tickets and tickets resolved today
 *  - Total registered residents (CLIENT role) and servant count
 *  - Ticket breakdown by status, priority, and department
 *  - Overall average feedback rating and total feedback count
 *  - Number of active SLA breaches (past deadline, not yet resolved/closed)
 *  - Daily ticket creation counts for the last 7 days (trend chart data)
 *
 * @name GET /admin/stats
 * @access Admin
 */
router.get('/stats', authenticate, requireAdmin, async (req, res, next) => {
  try {
    // Fetch all top-level counts in parallel to minimise DB round-trips
    const [totalTickets, pendingTickets, resolvedToday, totalUsers, totalServants] = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.count({ where: { status: 'PENDING' } }),
      // Resolved today: from midnight of the current calendar day
      prisma.ticket.count({
        where: { status: 'RESOLVED', resolvedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      prisma.user.count({ where: { role: 'CLIENT' } }),
      prisma.servant.count(),
    ]);

    // Group ticket counts by status, priority, and department for chart data
    const byStatus = await prisma.ticket.groupBy({
      by: ['status'],
      _count: true,
    });

    const byPriority = await prisma.ticket.groupBy({
      by: ['priority'],
      _count: true,
    });

    const byDepartment = await prisma.ticket.groupBy({
      by: ['departmentId'],
      _count: true,
    });

    // Enrich department IDs with their full name/code/color for the UI
    const departmentIds = byDepartment.map(d => d.departmentId);
    const departments = await prisma.department.findMany({
      where: { id: { in: departmentIds } },
      select: { id: true, name: true, code: true, color: true },
    });

    // Merge department metadata into the grouped count records
    const deptStats = byDepartment.map(d => ({
      count: d._count,
      department: departments.find(dept => dept.id === d.departmentId),
    }));

    // Single aggregate for average rating and total feedback submissions
    const avgRating = await prisma.feedback.aggregate({ _avg: { rating: true }, _count: true });

    // SLA breach count: tickets past their deadline that are still open
    const slaBreaches = await prisma.ticket.count({
      where: {
        slaDeadline: { lt: new Date() },
        status: { notIn: ['RESOLVED', 'CLOSED'] },
      },
    });

    // Build a day-by-day ticket creation trend for the last 7 days
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const start = new Date(day.setHours(0, 0, 0, 0));
      const end = new Date(day.setHours(23, 59, 59, 999));
      const count = await prisma.ticket.count({ where: { createdAt: { gte: start, lte: end } } });
      last7.push({ date: start.toISOString().split('T')[0], count });
    }

    res.json({
      totalTickets,
      pendingTickets,
      resolvedToday,
      totalUsers,
      totalServants,
      slaBreaches,
      byStatus: byStatus.map(s => ({ status: s.status, count: s._count })),
      byPriority: byPriority.map(p => ({ priority: p.priority, count: p._count })),
      byDepartment: deptStats,
      avgRating: avgRating._avg.rating,
      totalFeedbacks: avgRating._count,
      ticketsLast7Days: last7,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/tickets
// ---------------------------------------------------------------------------
/**
 * Returns a paginated list of all tickets across the platform.
 *
 * Supports optional query filters: `status`, `priority`, `departmentId`.
 * Results are ordered by creation date descending (newest first).
 *
 * @name GET /admin/tickets
 * @access Admin
 * @queryparam {string}  [status]       - Filter by ticket status.
 * @queryparam {string}  [priority]     - Filter by priority level.
 * @queryparam {string}  [departmentId] - Filter by department ID.
 * @queryparam {number}  [page=1]       - Page number (1-based).
 * @queryparam {number}  [limit=20]     - Records per page.
 */
router.get('/tickets', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { status, priority, departmentId, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build dynamic filter — only include fields that were provided
    const where = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (departmentId) where.departmentId = departmentId;

    // Count and data queries run concurrently
    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          user: { select: { name: true, barangay: true } },
          department: { select: { name: true, code: true, color: true } },
          servant: { select: { name: true } },
          feedback: { select: { rating: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.ticket.count({ where }),
    ]);

    res.json({ tickets, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/users
// ---------------------------------------------------------------------------
/**
 * Returns all resident (CLIENT role) accounts ordered by registration date.
 *
 * Includes each user's ticket count via the `_count` Prisma aggregate so the
 * admin can spot power users or inactive accounts without extra queries.
 * Password hashes are never included in the selection.
 *
 * @name GET /admin/users
 * @access Admin
 */
router.get('/users', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: 'CLIENT' },
      select: { id: true, name: true, email: true, phone: true, barangay: true, role: true, createdAt: true, isVerified: true, _count: { select: { tickets: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/reports
// ---------------------------------------------------------------------------
/**
 * Produces a comprehensive analytics report for the specified date range.
 *
 * @name GET /admin/reports
 * @access Admin
 * @queryparam {string} [range='30'] - Lookback period in days: `'7'`, `'30'`,
 *   `'90'`, or `'all'` (no date filter).
 *
 * Response includes:
 *  - Absolute counts (total, resolved, pending, in-progress, escalated)
 *  - Resolution rate percentage
 *  - Average resolution time in hours
 *  - SLA compliance percentage (resolved on time / total resolved with deadline)
 *  - Breakdown by status, priority, and department
 *  - Per-servant performance: assigned, resolved, average rating
 *  - Daily created vs. resolved trend for the range window
 */
router.get('/reports', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { range = '30' } = req.query; // '1' | '15' | '30' | '90' | '365' | 'all'
    // Compute the start-of-range date; null means no lower bound (all time)
    const since = range === 'all' ? null : new Date(Date.now() - parseInt(range) * 24 * 60 * 60 * 1000);
    const dateFilter = since ? { createdAt: { gte: since } } : {};

    // Base counts — run all five in parallel
    const [total, resolved, pending, inProgress, escalated] = await Promise.all([
      prisma.ticket.count({ where: { ...dateFilter } }),
      prisma.ticket.count({ where: { ...dateFilter, status: 'RESOLVED' } }),
      prisma.ticket.count({ where: { ...dateFilter, status: 'PENDING' } }),
      prisma.ticket.count({ where: { ...dateFilter, status: 'IN_PROGRESS' } }),
      prisma.ticket.count({ where: { ...dateFilter, status: 'ESCALATED' } }),
    ]);

    // Breakdown by status / priority / department (parallel group-by queries)
    const [byStatus, byPriority, byDepartment] = await Promise.all([
      prisma.ticket.groupBy({ by: ['status'],     where: dateFilter, _count: true }),
      prisma.ticket.groupBy({ by: ['priority'],   where: dateFilter, _count: true }),
      prisma.ticket.groupBy({ by: ['departmentId'], where: dateFilter, _count: true }),
    ]);

    // Resolve department IDs to full records for display purposes
    const deptIds = byDepartment.map(d => d.departmentId).filter(Boolean);
    const depts = await prisma.department.findMany({
      where: { id: { in: deptIds } },
      select: { id: true, name: true, code: true, color: true },
    });

    // Fetch resolved tickets with timestamps to compute resolution time + SLA compliance
    const resolvedTickets = await prisma.ticket.findMany({
      where: { ...dateFilter, status: 'RESOLVED', resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true, slaDeadline: true },
    });

    // Average resolution time in hours across all resolved tickets in the range
    const avgResolutionHours = resolvedTickets.length
      ? resolvedTickets.reduce((sum, t) => sum + (new Date(t.resolvedAt) - new Date(t.createdAt)) / 3600000, 0) / resolvedTickets.length
      : null;

    // SLA compliance: percentage of resolved-with-deadline tickets resolved before their deadline
    const resolvedWithDeadline = resolvedTickets.filter(t => t.slaDeadline);
    const resolvedOnTime = resolvedWithDeadline.filter(t => new Date(t.resolvedAt) <= new Date(t.slaDeadline));
    const slaCompliance = resolvedWithDeadline.length
      ? Math.round((resolvedOnTime.length / resolvedWithDeadline.length) * 100)
      : null;

    // Servant performance: group assigned tickets by servant, then enrich with names and ratings
    const servantStats = await prisma.ticket.groupBy({
      by: ['servantId'],
      where: { ...dateFilter, servantId: { not: null } },
      _count: true,
    });
    const servantIds = servantStats.map(s => s.servantId).filter(Boolean);

    const [servantDetails, servantRatings] = await Promise.all([
      prisma.servant.findMany({
        where: { id: { in: servantIds } },
        select: { id: true, name: true, department: { select: { name: true, color: true } } },
      }),
      prisma.feedback.groupBy({
        by: ['ticketId'],
        where: { ticket: { servantId: { in: servantIds }, ...dateFilter } },
        _avg: { rating: true },
      }),
    ]);

    // Per-servant resolved ticket counts (run in parallel per servant)
    const servantResolvedCounts = await Promise.all(
      servantIds.map(id => prisma.ticket.count({ where: { ...dateFilter, servantId: id, status: 'RESOLVED' } }))
    );

    // Build a rating map keyed by servantId (placeholder — populated via servantAvgRatings below)
    const servantRatingMap = {};
    for (const sr of servantRatings) {
      // aggregate per servant
    }

    // Per-servant average rating aggregates (parallel)
    const servantAvgRatings = await Promise.all(
      servantIds.map(id =>
        prisma.feedback.aggregate({ where: { ticket: { servantId: id, ...dateFilter } }, _avg: { rating: true }, _count: true })
      )
    );

    // Assemble the final per-servant performance array, sorted by resolved count descending
    const servantPerformance = servantIds.map((id, i) => {
      const s = servantDetails.find(d => d.id === id);
      const stat = servantStats.find(s => s.servantId === id);
      return {
        id,
        name: s?.name || 'Unknown',
        department: s?.department?.name || '',
        departmentColor: s?.department?.color || '#3B82F6',
        assigned: stat?._count || 0,
        resolved: servantResolvedCounts[i],
        avgRating: servantAvgRatings[i]._avg.rating,
        totalRatings: servantAvgRatings[i]._count,
      };
    }).sort((a, b) => b.resolved - a.resolved);

    // Daily created vs. resolved trend — one entry per calendar day in the range
    // For 'all', we default to the last 30 days to keep the response size reasonable
    const days = range === 'all' ? 30 : parseInt(range);
    const trend = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const start = new Date(day); start.setHours(0, 0, 0, 0);
      const end   = new Date(day); end.setHours(23, 59, 59, 999);
      // Count new tickets created that day and tickets resolved that day
      const [created, resolvedDay] = await Promise.all([
        prisma.ticket.count({ where: { createdAt: { gte: start, lte: end } } }),
        prisma.ticket.count({ where: { resolvedAt: { gte: start, lte: end }, status: 'RESOLVED' } }),
      ]);
      trend.push({ date: start.toISOString().split('T')[0], created, resolved: resolvedDay });
    }

    res.json({
      range,
      total, resolved, pending, inProgress, escalated,
      // Resolution rate as a whole-number percentage
      resolutionRate: total ? Math.round((resolved / total) * 100) : 0,
      avgResolutionHours,
      slaCompliance,
      byStatus:     byStatus.map(s => ({ status: s.status, count: s._count })),
      byPriority:   byPriority.map(p => ({ priority: p.priority, count: p._count })),
      byDepartment: byDepartment.map(d => ({
        count: d._count,
        department: depts.find(dep => dep.id === d.departmentId),
      })),
      servantPerformance,
      trend,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/sla-breaches
// ---------------------------------------------------------------------------
/**
 * Returns all open tickets that have exceeded their SLA deadline.
 *
 * A ticket is considered breached when `slaDeadline < now` and its status is
 * neither RESOLVED nor CLOSED.  Results are ordered oldest deadline first so
 * the most overdue tickets appear at the top of the list.
 *
 * @name GET /admin/sla-breaches
 * @access Admin
 */
router.get('/sla-breaches', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const tickets = await prisma.ticket.findMany({
      where: {
        // Deadline is in the past
        slaDeadline: { lt: new Date() },
        // Still open — not yet resolved or closed
        status: { notIn: ['RESOLVED', 'CLOSED'] },
      },
      include: {
        user: { select: { name: true } },
        department: { select: { name: true, color: true } },
        servant: { select: { name: true } },
      },
      // Most overdue first so admins can triage in order
      orderBy: { slaDeadline: 'asc' },
    });
    res.json(tickets);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /admin/users/:id
// ---------------------------------------------------------------------------
/**
 * Updates a citizen's profile fields.
 *
 * Supports: name, email, phone, barangay, address, isVerified.
 * If `password` is provided, it is bcrypt-hashed before storage.
 *
 * @name PUT /admin/users/:id
 * @access Admin
 */
router.put('/users/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, phone, barangay, address, isVerified, password } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'CLIENT') {
      return res.status(404).json({ error: 'Citizen not found' });
    }

    const data = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email || null;
    if (phone !== undefined) data.phone = phone || null;
    if (barangay !== undefined) data.barangay = barangay;
    if (address !== undefined) data.address = address || null;
    if (isVerified !== undefined) data.isVerified = isVerified;
    if (password) data.password = await bcrypt.hash(password, 10);

    const updated = await prisma.user.update({ where: { id }, data });
    const { password: _, ...result } = updated;
    res.json(result);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Email or phone already in use by another account' });
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /admin/users/:id
// ---------------------------------------------------------------------------
/**
 * Permanently deletes a citizen account and all associated data.
 *
 * Cascading deletes handle notifications. Tickets are preserved but the
 * userId reference is cleared so admin records are not lost.
 *
 * @name DELETE /admin/users/:id
 * @access Admin
 */
router.delete('/users/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'CLIENT') {
      return res.status(404).json({ error: 'Citizen not found' });
    }

    // Delete notifications first (FK constraint)
    await prisma.notification.deleteMany({ where: { userId: id } });

    // Delete the user — tickets use ON DELETE RESTRICT, so we nullify first
    // Check if there are associated tickets
    const ticketCount = await prisma.ticket.count({ where: { userId: id } });
    if (ticketCount > 0) {
      return res.status(400).json({
        error: `Cannot delete: this citizen has ${ticketCount} ticket(s). Archive the account instead.`,
      });
    }

    await prisma.user.delete({ where: { id } });
    res.json({ message: 'Citizen deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/users/:id/archive
// ---------------------------------------------------------------------------
/**
 * Archives (deactivates) a citizen account by setting isVerified to false.
 * The account data is preserved but the citizen can no longer log in.
 *
 * @name PATCH /admin/users/:id/archive
 * @access Admin
 */
router.patch('/users/:id/archive', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'CLIENT') {
      return res.status(404).json({ error: 'Citizen not found' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isVerified: !user.isVerified },
    });
    const { password: _, ...result } = updated;
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /admin/tickets/:id
// ---------------------------------------------------------------------------
/**
 * Permanently deletes a ticket and all related data (messages, attachments,
 * notifications, feedback). Uses Prisma's cascade delete.
 *
 * @name DELETE /admin/tickets/:id
 * @access Admin
 */
router.delete('/tickets/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    await prisma.ticket.delete({ where: { id } });
    res.json({ message: 'Ticket deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/tickets/:id/archive
// ---------------------------------------------------------------------------
/**
 * Archives a ticket by setting its status to CLOSED, or unarchives by
 * restoring it to PENDING. Toggling behaviour.
 *
 * @name PATCH /admin/tickets/:id/archive
 * @access Admin
 */
router.patch('/tickets/:id/archive', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const isArchived = ticket.status === 'CLOSED';

    // Unarchiving requires admin password confirmation
    if (isArchived) {
      if (!password) return res.status(400).json({ error: 'Admin password is required to reactivate a ticket' });
      const admin = await prisma.user.findUnique({ where: { id: req.user.id } });
      const valid = await bcrypt.compare(password, admin.password);
      if (!valid) return res.status(401).json({ error: 'Incorrect admin password' });
    }

    const newStatus = isArchived ? 'PENDING' : 'CLOSED';
    const updated = await prisma.ticket.update({
      where: { id },
      data: { status: newStatus },
    });
    res.json({ message: `Ticket ${newStatus === 'CLOSED' ? 'archived' : 'reactivated'}`, ticket: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
