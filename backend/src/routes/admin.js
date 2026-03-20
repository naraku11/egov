import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Dashboard overview stats
router.get('/stats', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const [totalTickets, pendingTickets, resolvedToday, totalUsers, totalServants] = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.count({ where: { status: 'PENDING' } }),
      prisma.ticket.count({
        where: { status: 'RESOLVED', resolvedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      prisma.user.count({ where: { role: 'CLIENT' } }),
      prisma.servant.count(),
    ]);

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

    const departmentIds = byDepartment.map(d => d.departmentId);
    const departments = await prisma.department.findMany({
      where: { id: { in: departmentIds } },
      select: { id: true, name: true, code: true, color: true },
    });

    const deptStats = byDepartment.map(d => ({
      count: d._count,
      department: departments.find(dept => dept.id === d.departmentId),
    }));

    const avgRating = await prisma.feedback.aggregate({ _avg: { rating: true }, _count: true });

    // SLA breach count (tickets past slaDeadline not resolved)
    const slaBreaches = await prisma.ticket.count({
      where: {
        slaDeadline: { lt: new Date() },
        status: { notIn: ['RESOLVED', 'CLOSED'] },
      },
    });

    // Recent tickets (last 7 days by day)
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

// All tickets (admin view)
router.get('/tickets', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { status, priority, departmentId, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (departmentId) where.departmentId = departmentId;

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

// All users
router.get('/users', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, phone: true, barangay: true, role: true, createdAt: true, isVerified: true, _count: { select: { tickets: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// Reports — summary data with optional date range
router.get('/reports', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { range = '30' } = req.query; // '7' | '30' | '90' | 'all'
    const since = range === 'all' ? null : new Date(Date.now() - parseInt(range) * 24 * 60 * 60 * 1000);
    const dateFilter = since ? { createdAt: { gte: since } } : {};

    // Base counts
    const [total, resolved, pending, inProgress, escalated] = await Promise.all([
      prisma.ticket.count({ where: { ...dateFilter } }),
      prisma.ticket.count({ where: { ...dateFilter, status: 'RESOLVED' } }),
      prisma.ticket.count({ where: { ...dateFilter, status: 'PENDING' } }),
      prisma.ticket.count({ where: { ...dateFilter, status: 'IN_PROGRESS' } }),
      prisma.ticket.count({ where: { ...dateFilter, status: 'ESCALATED' } }),
    ]);

    // By status / priority / department
    const [byStatus, byPriority, byDepartment] = await Promise.all([
      prisma.ticket.groupBy({ by: ['status'],     where: dateFilter, _count: true }),
      prisma.ticket.groupBy({ by: ['priority'],   where: dateFilter, _count: true }),
      prisma.ticket.groupBy({ by: ['departmentId'], where: dateFilter, _count: true }),
    ]);

    const deptIds = byDepartment.map(d => d.departmentId).filter(Boolean);
    const depts = await prisma.department.findMany({
      where: { id: { in: deptIds } },
      select: { id: true, name: true, code: true, color: true },
    });

    // Avg resolution time (hours) for resolved tickets in range
    const resolvedTickets = await prisma.ticket.findMany({
      where: { ...dateFilter, status: 'RESOLVED', resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true, slaDeadline: true },
    });
    const avgResolutionHours = resolvedTickets.length
      ? resolvedTickets.reduce((sum, t) => sum + (new Date(t.resolvedAt) - new Date(t.createdAt)) / 3600000, 0) / resolvedTickets.length
      : null;

    // SLA compliance: resolved on time / total resolved (with deadline)
    const resolvedWithDeadline = resolvedTickets.filter(t => t.slaDeadline);
    const resolvedOnTime = resolvedWithDeadline.filter(t => new Date(t.resolvedAt) <= new Date(t.slaDeadline));
    const slaCompliance = resolvedWithDeadline.length
      ? Math.round((resolvedOnTime.length / resolvedWithDeadline.length) * 100)
      : null;

    // Servant performance
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
    const servantResolvedCounts = await Promise.all(
      servantIds.map(id => prisma.ticket.count({ where: { ...dateFilter, servantId: id, status: 'RESOLVED' } }))
    );
    const servantRatingMap = {};
    for (const sr of servantRatings) {
      // aggregate per servant
    }
    const servantAvgRatings = await Promise.all(
      servantIds.map(id =>
        prisma.feedback.aggregate({ where: { ticket: { servantId: id, ...dateFilter } }, _avg: { rating: true }, _count: true })
      )
    );
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

    // Daily trend for the range
    const days = range === 'all' ? 30 : parseInt(range);
    const trend = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const start = new Date(day); start.setHours(0, 0, 0, 0);
      const end   = new Date(day); end.setHours(23, 59, 59, 999);
      const [created, resolvedDay] = await Promise.all([
        prisma.ticket.count({ where: { createdAt: { gte: start, lte: end } } }),
        prisma.ticket.count({ where: { resolvedAt: { gte: start, lte: end }, status: 'RESOLVED' } }),
      ]);
      trend.push({ date: start.toISOString().split('T')[0], created, resolved: resolvedDay });
    }

    res.json({
      range,
      total, resolved, pending, inProgress, escalated,
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

// SLA breach tickets
router.get('/sla-breaches', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const tickets = await prisma.ticket.findMany({
      where: {
        slaDeadline: { lt: new Date() },
        status: { notIn: ['RESOLVED', 'CLOSED'] },
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

export default router;
