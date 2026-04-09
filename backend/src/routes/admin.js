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

    // Group ticket counts by status, priority, department + aggregates — all in parallel
    const [byStatus, byPriority, byDepartment, avgRating, slaBreaches] = await Promise.all([
      prisma.ticket.groupBy({ by: ['status'], _count: true }),
      prisma.ticket.groupBy({ by: ['priority'], _count: true }),
      prisma.ticket.groupBy({ by: ['departmentId'], _count: true }),
      prisma.feedback.aggregate({ _avg: { rating: true }, _count: true }),
      prisma.ticket.count({
        where: { slaDeadline: { lt: new Date() }, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      }),
    ]);

    // Enrich department IDs with their full name/code/color for the UI
    const departmentIds = byDepartment.map(d => d.departmentId);
    const departments = await prisma.department.findMany({
      where: { id: { in: departmentIds } },
      select: { id: true, name: true, code: true, color: true },
    });

    const deptStats = byDepartment.map(d => ({
      count: d._count,
      department: departments.find(dept => dept.id === d.departmentId),
    }));

    // Build a day-by-day ticket creation trend for the last 7 days.
    // Uses a Map for O(n) grouping instead of O(n*7) repeated .filter() calls.
    const trendStart = new Date(); trendStart.setDate(trendStart.getDate() - 6); trendStart.setHours(0, 0, 0, 0);
    const trendTickets = await prisma.ticket.findMany({
      where: { createdAt: { gte: trendStart } },
      select: { createdAt: true },
    });
    const trendMap = {};
    for (const t of trendTickets) {
      const key = t.createdAt.toISOString().split('T')[0];
      trendMap[key] = (trendMap[key] || 0) + 1;
    }
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(); day.setDate(day.getDate() - i);
      const dateStr = new Date(day.setHours(0, 0, 0, 0)).toISOString().split('T')[0];
      last7.push({ date: dateStr, count: trendMap[dateStr] || 0 });
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
    const { page, limit: lim } = req.query;
    const select = { id: true, name: true, email: true, phone: true, barangay: true, role: true, createdAt: true, isVerified: true, idPhotoUrl: true, idStatus: true, _count: { select: { tickets: true } } };

    // Support optional pagination — if page/limit are provided, paginate;
    // otherwise return all (backwards-compatible with existing frontend).
    if (page) {
      const take = parseInt(lim) || 50;
      const skip = (parseInt(page) - 1) * take;
      const [users, total] = await Promise.all([
        prisma.user.findMany({ where: { role: 'CLIENT' }, select, orderBy: { createdAt: 'desc' }, skip, take }),
        prisma.user.count({ where: { role: 'CLIENT' } }),
      ]);
      return res.json({ users, total, page: parseInt(page), totalPages: Math.ceil(total / take) });
    }

    const users = await prisma.user.findMany({
      where: { role: 'CLIENT' }, select, orderBy: { createdAt: 'desc' },
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

    const servantDetails = await prisma.servant.findMany({
      where: { id: { in: servantIds } },
      select: { id: true, name: true, department: { select: { name: true, color: true } } },
    });

    // Per-servant resolved counts — single groupBy instead of N individual counts
    const servantResolvedGroup = await prisma.ticket.groupBy({
      by: ['servantId'],
      where: { ...dateFilter, servantId: { in: servantIds }, status: 'RESOLVED' },
      _count: true,
    });
    const servantResolvedMap = Object.fromEntries(servantResolvedGroup.map(s => [s.servantId, s._count]));

    // Per-servant average ratings — single raw aggregate instead of N individual aggregates
    const servantRatingGroup = await prisma.feedback.groupBy({
      by: ['ticketId'],
      where: { ticket: { servantId: { in: servantIds }, ...dateFilter } },
      _avg: { rating: true },
    });
    // Map ratings back to servantId by looking up ticket ownership
    const ratingTicketIds = servantRatingGroup.map(r => r.ticketId);
    const ratingTickets = ratingTicketIds.length ? await prisma.ticket.findMany({
      where: { id: { in: ratingTicketIds } },
      select: { id: true, servantId: true },
    }) : [];
    const ticketServantMap = Object.fromEntries(ratingTickets.map(t => [t.id, t.servantId]));

    // Aggregate ratings per servant
    const servantRatingAgg = {};
    for (const r of servantRatingGroup) {
      const sid = ticketServantMap[r.ticketId];
      if (!sid) continue;
      if (!servantRatingAgg[sid]) servantRatingAgg[sid] = { sum: 0, count: 0 };
      if (r._avg.rating != null) { servantRatingAgg[sid].sum += r._avg.rating; servantRatingAgg[sid].count++; }
    }

    // Assemble the final per-servant performance array, sorted by resolved count descending
    const servantPerformance = servantIds.map((id) => {
      const s = servantDetails.find(d => d.id === id);
      const stat = servantStats.find(s => s.servantId === id);
      const ra = servantRatingAgg[id];
      return {
        id,
        name: s?.name || 'Unknown',
        department: s?.department?.name || '',
        departmentColor: s?.department?.color || '#3B82F6',
        assigned: stat?._count || 0,
        resolved: servantResolvedMap[id] || 0,
        avgRating: ra ? ra.sum / ra.count : null,
        totalRatings: ra?.count || 0,
      };
    }).sort((a, b) => b.resolved - a.resolved);

    // Daily created vs. resolved trend — bulk fetch + Map grouping (O(n))
    // instead of repeated .filter() per day which was O(n*days).
    const days = range === 'all' ? 30 : parseInt(range);
    const trendRangeStart = new Date(); trendRangeStart.setDate(trendRangeStart.getDate() - (days - 1)); trendRangeStart.setHours(0, 0, 0, 0);
    const [trendCreated, trendResolved] = await Promise.all([
      prisma.ticket.findMany({
        where: { createdAt: { gte: trendRangeStart } },
        select: { createdAt: true },
      }),
      prisma.ticket.findMany({
        where: { resolvedAt: { gte: trendRangeStart }, status: 'RESOLVED' },
        select: { resolvedAt: true },
      }),
    ]);
    const createdMap = {};
    for (const t of trendCreated) {
      const key = t.createdAt.toISOString().split('T')[0];
      createdMap[key] = (createdMap[key] || 0) + 1;
    }
    const resolvedMap = {};
    for (const t of trendResolved) {
      const key = t.resolvedAt.toISOString().split('T')[0];
      resolvedMap[key] = (resolvedMap[key] || 0) + 1;
    }
    const trend = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(); day.setDate(day.getDate() - i);
      const dateStr = new Date(day.setHours(0, 0, 0, 0)).toISOString().split('T')[0];
      trend.push({
        date: dateStr,
        created: createdMap[dateStr] || 0,
        resolved: resolvedMap[dateStr] || 0,
      });
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
    const archived = req.query.archived === 'true';
    const tickets = await prisma.ticket.findMany({
      where: {
        slaDeadline: { lt: new Date() },
        status: archived
          ? 'CLOSED'
          : { notIn: ['RESOLVED', 'CLOSED'] },
      },
      include: {
        user: { select: { name: true } },
        department: { select: { name: true, color: true } },
        servant: { select: { name: true } },
      },
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
// PATCH /admin/users/:id/id-review
// ---------------------------------------------------------------------------
/**
 * Approves or rejects a citizen's uploaded ID photo.
 *
 * Body: { action: 'approve' | 'reject' }
 * - approve → sets idStatus to VERIFIED
 * - reject  → sets idStatus to REJECTED
 *
 * @name PATCH /admin/users/:id/id-review
 * @access Admin
 */
router.patch('/users/:id/id-review', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "approve" or "reject"' });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'CLIENT') {
      return res.status(404).json({ error: 'Citizen not found' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { idStatus: action === 'approve' ? 'VERIFIED' : 'REJECTED' },
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
