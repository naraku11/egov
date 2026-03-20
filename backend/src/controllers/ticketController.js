import prisma from '../lib/prisma.js';
import { classifyConcern } from '../services/classifier.js';
import { createNotification } from '../services/notification.js';
import { getIO } from '../lib/socket.js';
import path from 'path';

const generateTicketNumber = () => {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `TKT-${y}${m}${d}-${rand}`;
};

const getSlaDeadline = (priority) => {
  const hours = { URGENT: 4, NORMAL: 48, LOW: 120 };
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + (hours[priority] || 48));
  return deadline;
};

const findAvailableServant = async (departmentId) => {
  return prisma.servant.findFirst({
    where: { departmentId, status: 'AVAILABLE' },
    orderBy: { workload: 'asc' },
  });
};

export const createTicket = async (req, res, next) => {
  try {
    const { title, description, category, priority = 'NORMAL', latitude, longitude, departmentId: manualDeptId } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    // AI Classification
    let departmentId = manualDeptId;
    let aiConfidence = null;

    if (!departmentId) {
      const classification = await classifyConcern(title + ' ' + description);
      departmentId = classification.departmentId;
      aiConfidence = classification.confidence;
    }

    if (!departmentId) {
      // fallback to Mayor's Office
      const mayorsDept = await prisma.department.findFirst({ where: { code: 'MAYORS' } });
      departmentId = mayorsDept?.id;
    }

    // Find available servant
    const servant = await findAvailableServant(departmentId);

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: generateTicketNumber(),
        userId: req.user.id,
        departmentId,
        servantId: servant?.id || null,
        title,
        description,
        category: category || 'General',
        priority,
        status: servant ? 'ASSIGNED' : 'PENDING',
        aiConfidence,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        slaDeadline: getSlaDeadline(priority),
        attachments: req.files?.length ? {
          create: req.files.map(f => ({
            fileName: f.originalname,
            filePath: `/uploads/tickets/${path.basename(f.path)}`,
            fileSize: f.size,
            mimeType: f.mimetype,
          })),
        } : undefined,
      },
      include: {
        department: true,
        servant: { select: { name: true, position: true } },
        attachments: true,
      },
    });

    // Update servant workload
    if (servant) {
      await prisma.servant.update({
        where: { id: servant.id },
        data: { workload: { increment: 1 } },
      });
    }

    // System message
    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        senderType: 'SYSTEM',
        senderName: 'System',
        message: `Ticket ${ticket.ticketNumber} created and ${servant ? `assigned to ${servant.name}` : 'pending assignment'}.`,
      },
    });

    // Notify resident
    await createNotification(
      req.user.id,
      ticket.id,
      'TICKET_CREATED',
      'Ticket Submitted',
      `Your concern has been submitted. Ticket #${ticket.ticketNumber}`
    );

    const io = getIO();
    if (io) {
      io.to('admin').emit('ticket:created', {
        id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
        status: ticket.status, priority: ticket.priority,
        department: ticket.department, createdAt: ticket.createdAt,
      });
      if (servant) io.to(`servant:${servant.id}`).emit('ticket:assigned', ticket);
    }

    res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
};

export const getTickets = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { userId: req.user.id };
    if (status) where.status = status;

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          department: { select: { name: true, code: true, color: true } },
          servant: { select: { name: true, position: true } },
          feedback: { select: { rating: true } },
          _count: { select: { messages: true } },
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
};

export const getTicket = async (req, res, next) => {
  try {
    const { id } = req.params;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true, phone: true, barangay: true } },
        department: true,
        servant: { select: { id: true, name: true, position: true, email: true } },
        attachments: true,
        messages: {
          // servants and admins see all messages (including internal notes); clients only see non-internal
          ...(req.userType !== 'servant' && req.user?.role !== 'ADMIN'
            ? { where: { isInternal: false } }
            : {}),
          orderBy: { createdAt: 'asc' },
        },
        feedback: true,
      },
    });

    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    // Ensure the requester owns the ticket or is the assigned servant/admin
    if (req.userType === 'user' && ticket.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(ticket);
  } catch (err) {
    next(err);
  }
};

export const getServantTickets = async (req, res, next) => {
  try {
    const { status, priority, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { servantId: req.servant.id };
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          user: { select: { name: true, barangay: true, phone: true, email: true } },
          department: { select: { name: true, code: true, color: true } },
          attachments: { select: { id: true, fileName: true, filePath: true, mimeType: true } },
          _count: { select: { messages: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        skip,
        take: parseInt(limit),
      }),
      prisma.ticket.count({ where }),
    ]);

    res.json({ tickets, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
};

export const updateTicketStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.servantId !== req.servant.id) {
      return res.status(403).json({ error: 'Not assigned to this ticket' });
    }

    const updated = await prisma.ticket.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? new Date() : undefined,
      },
      include: { user: true, department: true },
    });

    if (notes) {
      await prisma.ticketMessage.create({
        data: {
          ticketId: id,
          servantId: req.servant.id,
          senderType: 'SERVANT',
          senderName: req.servant.name,
          message: notes,
        },
      });
    }

    // Notify resident
    const statusLabels = {
      IN_PROGRESS: 'In Progress',
      RESOLVED: 'Resolved',
      CLOSED: 'Closed',
      ESCALATED: 'Escalated',
    };
    await createNotification(
      ticket.userId,
      ticket.id,
      'STATUS_UPDATE',
      `Ticket ${statusLabels[status] || status}`,
      `Your ticket #${ticket.ticketNumber} is now ${statusLabels[status] || status}.`
    );

    if (status === 'RESOLVED') {
      await prisma.servant.update({
        where: { id: req.servant.id },
        data: { workload: { decrement: 1 } },
      });
    }

    const io = getIO();
    if (io) {
      const payload = { id, status, resolvedAt: updated.resolvedAt };
      io.to(`ticket:${id}`).emit('ticket:updated', payload);
      io.to('admin').emit('ticket:updated', payload);
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

export const addMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message, isInternal = false } = req.body;

    if (!message) return res.status(400).json({ error: 'Message is required' });

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const isServant = req.userType === 'servant';
    const senderName = isServant ? req.servant.name : req.user.name;

    const msg = await prisma.ticketMessage.create({
      data: {
        ticketId: id,
        servantId: isServant ? req.servant.id : null,
        senderType: isServant ? 'SERVANT' : 'CLIENT',
        senderName,
        message,
        isInternal: isServant ? isInternal : false,
      },
    });

    // Notify the other party
    if (isServant) {
      await createNotification(
        ticket.userId,
        ticket.id,
        'NEW_MESSAGE',
        'New Response',
        `${senderName} replied to your ticket #${ticket.ticketNumber}`
      );
    }

    const io = getIO();
    if (io) io.to(`ticket:${id}`).emit('message:new', msg);

    res.status(201).json(msg);
  } catch (err) {
    next(err);
  }
};

export const submitFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.userId !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const feedback = await prisma.feedback.upsert({
      where: { ticketId: id },
      update: { rating: parseInt(rating), comment },
      create: { ticketId: id, rating: parseInt(rating), comment },
    });

    res.json(feedback);
  } catch (err) {
    next(err);
  }
};

export const assignTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await prisma.ticket.update({
      where: { id },
      data: { servantId: req.servant.id, status: 'ASSIGNED' },
      include: { user: true },
    });

    await prisma.servant.update({
      where: { id: req.servant.id },
      data: { workload: { increment: 1 } },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

export const escalateTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const ticket = await prisma.ticket.update({
      where: { id },
      data: { status: 'ESCALATED', priority: 'URGENT', escalatedAt: new Date(), escalationReason: reason || null },
      include: { user: true },
    });

    await prisma.ticketMessage.create({
      data: {
        ticketId: id,
        servantId: req.servant.id,
        senderType: 'SYSTEM',
        senderName: 'System',
        message: `Ticket escalated by ${req.servant.name}. Reason: ${reason || 'Requires higher attention'}`,
        isInternal: false,
      },
    });

    await createNotification(
      ticket.userId,
      ticket.id,
      'ESCALATED',
      'Ticket Escalated',
      `Your ticket #${ticket.ticketNumber} has been escalated for priority handling.`
    );

    const io2 = getIO();
    if (io2) {
      const payload = { id, status: 'ESCALATED', priority: 'URGENT' };
      io2.to(`ticket:${id}`).emit('ticket:updated', payload);
      io2.to('admin').emit('ticket:updated', payload);
    }

    res.json(ticket);
  } catch (err) {
    next(err);
  }
};

export const classifyAndRoute = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    const result = await classifyConcern(text);
    const dept = await prisma.department.findUnique({ where: { id: result.departmentId } });

    res.json({ ...result, department: dept });
  } catch (err) {
    next(err);
  }
};
