/**
 * @file ticketController.js
 * @description Ticket (concern/request) controller for the eGov platform.
 *
 * Manages the full lifecycle of a citizen concern from submission to resolution:
 *  - Ticket creation with AI-assisted department classification and SLA deadline
 *  - Paginated ticket listing for residents, servants, and admins
 *  - Individual ticket retrieval with role-based message visibility
 *  - Status updates (IN_PROGRESS → RESOLVED / CLOSED / ESCALATED)
 *  - Threaded messaging between residents and assigned servants
 *  - Post-resolution feedback / star rating collection
 *  - Self-assignment and manual escalation by servants
 *  - Text-only AI classification endpoint for testing the classifier
 *
 * Real-time updates are broadcast over Socket.IO to the `admin` room and
 * per-ticket rooms (`ticket:<id>`) so the frontend reflects changes instantly.
 */

import prisma from '../lib/prisma.js';
import { classifyConcern } from '../services/classifier.js';
import { createNotification, sendTicketAssignedEmail } from '../services/notification.js';
import { getIO } from '../lib/socket.js';
import path from 'path';

/**
 * Generates a unique human-readable ticket number in the format
 * `TKT-YYYYMMDD-XXXX` where XXXX is a random 4-digit number.
 *
 * @returns {string} A ticket identifier string, e.g. `TKT-20240315-4782`.
 */
const generateTicketNumber = () => {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `TKT-${y}${m}${d}-${rand}`;
};

/**
 * Calculates the SLA (Service Level Agreement) deadline for a ticket based
 * on its priority.
 *
 * Priority-to-hours mapping:
 *  - URGENT  →  4 hours
 *  - NORMAL  → 48 hours  (default)
 *  - LOW     → 120 hours
 *
 * @param {string} priority - One of `'URGENT'`, `'NORMAL'`, or `'LOW'`.
 * @returns {Date} The absolute deadline Date object.
 */
const getSlaDeadline = (priority) => {
  const hours = { URGENT: 4, NORMAL: 48, LOW: 120 };
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + (hours[priority] || 48));
  return deadline;
};

/**
 * Finds the least-loaded available servant within a given department.
 * Returns `null` if no available servant exists.
 *
 * @param {string} departmentId - The department's database ID.
 * @returns {Promise<Object|null>} The servant record or null.
 */
const findAvailableServant = async (departmentId) => {
  return prisma.servant.findFirst({
    where: { departmentId, status: 'AVAILABLE' },
    // Prefer servants with fewer open tickets to balance workload
    orderBy: { workload: 'asc' },
  });
};

/**
 * POST /tickets
 * Creates a new support ticket for the authenticated resident.
 *
 * If no `departmentId` is supplied, the AI classifier (`classifyConcern`) is
 * invoked to determine the appropriate department.  Falls back to the Mayor's
 * Office when classification returns no result.
 *
 * The ticket is immediately assigned to an available servant if one exists;
 * otherwise it is left in PENDING state.  File attachments (multipart) are
 * persisted under `/uploads/tickets/`.
 *
 * Emits `ticket:created` to the `admin` Socket.IO room and, when assigned,
 * `ticket:assigned` to the servant's private room.
 *
 * @param {import('express').Request}  req  - Body: { title, description, category?,
 *   priority?, latitude?, longitude?, departmentId? }; `req.files` for attachments.
 * @param {import('express').Response} res  - 201 with the full ticket on success.
 * @param {import('express').NextFunction} next
 */
export const createTicket = async (req, res, next) => {
  try {
    const { title, description, category, priority = 'NORMAL', latitude, longitude, departmentId: manualDeptId } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    // AI Classification — only run when the caller didn't specify a department
    let departmentId = manualDeptId;
    let aiConfidence = null;

    if (!departmentId) {
      // Concatenate title + description for richer classifier input
      const classification = await classifyConcern(title + ' ' + description);
      departmentId = classification.departmentId;
      aiConfidence = classification.confidence;
    }

    if (!departmentId) {
      // fallback to Mayor's Office when classifier returns nothing
      const mayorsDept = await prisma.department.findFirst({ where: { code: 'MAYORS' } });
      departmentId = mayorsDept?.id;
    }

    // Auto-assign to the least-busy available servant in the resolved department
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
        // Status is ASSIGNED only when a servant was found, otherwise PENDING
        status: servant ? 'ASSIGNED' : 'PENDING',
        aiConfidence,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        slaDeadline: getSlaDeadline(priority),
        // Create attachment records for each uploaded file
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

    // Increment the assigned servant's workload counter
    if (servant) {
      await prisma.servant.update({
        where: { id: servant.id },
        data: { workload: { increment: 1 } },
      });
    }

    // Insert an automatic system message as the first thread entry
    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        senderType: 'SYSTEM',
        senderName: 'System',
        message: `Ticket ${ticket.ticketNumber} created and ${servant ? `assigned to ${servant.name}` : 'pending assignment'}.`,
      },
    });

    // Notify the resident that their ticket was received
    await createNotification(
      req.user.id,
      ticket.id,
      'TICKET_CREATED',
      'Ticket Submitted',
      `Your concern has been submitted. Ticket #${ticket.ticketNumber}`
    );

    // Email the assigned servant about the new ticket
    if (servant) {
      sendTicketAssignedEmail(servant.email, servant.name, ticket);
    }

    // Push real-time updates to admin dashboard and assigned servant
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

/**
 * GET /tickets
 * Returns a paginated list of tickets belonging to the authenticated resident.
 *
 * @param {import('express').Request}  req  - Query: { status?, page?, limit? }
 * @param {import('express').Response} res  - 200 with `{ tickets, total, page, totalPages }`.
 * @param {import('express').NextFunction} next
 */
export const getTickets = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    // Calculate the number of records to skip for offset-based pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Scope the query to the current user's own tickets
    const where = { userId: req.user.id };
    if (status) where.status = status;

    // Run count and data queries in parallel for efficiency
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

/**
 * GET /tickets/:id
 * Retrieves a single ticket by its database ID.
 *
 * Access rules:
 *  - Residents may only view their own tickets.
 *  - Servants and admins may view any ticket.
 *  - Message visibility: servants/admins see all messages (including internal
 *    notes); residents only see non-internal messages.
 *
 * @param {import('express').Request}  req  - Params: { id }
 * @param {import('express').Response} res  - 200 with full ticket or 403/404.
 * @param {import('express').NextFunction} next
 */
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

/**
 * GET /servant/tickets
 * Returns a paginated list of tickets assigned to the authenticated servant.
 *
 * Results are sorted by priority descending then by age ascending so the most
 * critical and oldest tickets appear first.
 *
 * @param {import('express').Request}  req  - Query: { status?, priority?, page?, limit? }
 * @param {import('express').Response} res  - 200 with `{ tickets, total, page, totalPages }`.
 * @param {import('express').NextFunction} next
 */
export const getServantTickets = async (req, res, next) => {
  try {
    const { status, priority, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Scope to the authenticated servant only
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
        // Urgent/high-priority first; within same priority, oldest first (FIFO)
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

/**
 * PATCH /tickets/:id/status
 * Allows the assigned servant to update the status of a ticket.
 *
 * Setting the status to RESOLVED or CLOSED stamps the `resolvedAt` timestamp
 * and decrements the servant's workload counter so they can be assigned new
 * tickets.  An optional `notes` string is persisted as a thread message.
 *
 * Emits `ticket:updated` to the ticket room and admin room via Socket.IO.
 *
 * @param {import('express').Request}  req  - Params: { id }; Body: { status, notes? }
 * @param {import('express').Response} res  - 200 with updated ticket on success.
 * @param {import('express').NextFunction} next
 */
export const updateTicketStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    // Only the servant assigned to this ticket may change its status
    if (ticket.servantId !== req.servant.id) {
      return res.status(403).json({ error: 'Not assigned to this ticket' });
    }

    const updated = await prisma.ticket.update({
      where: { id },
      data: {
        status,
        // Stamp the resolution time when the ticket reaches a terminal state
        resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? new Date() : undefined,
      },
      include: { user: true, department: true },
    });

    // Persist the servant's resolution notes as a thread message if provided
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

    // Human-readable labels for the push notification body
    const statusLabels = {
      IN_PROGRESS: 'In Progress',
      RESOLVED: 'Resolved',
      CLOSED: 'Closed',
      ESCALATED: 'Escalated',
    };
    // Notify the resident of the status change
    await createNotification(
      ticket.userId,
      ticket.id,
      'STATUS_UPDATE',
      `Ticket ${statusLabels[status] || status}`,
      `Your ticket #${ticket.ticketNumber} is now ${statusLabels[status] || status}.`
    );

    // Free up the servant's workload slot when the ticket is resolved
    if (status === 'RESOLVED') {
      await prisma.servant.update({
        where: { id: req.servant.id },
        data: { workload: { decrement: 1 } },
      });
    }

    // Broadcast the status change in real time
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

/**
 * POST /tickets/:id/messages
 * Appends a message to the ticket's conversation thread.
 *
 * Both residents and servants can send messages.  Only servants may mark a
 * message as `isInternal` (an internal note not visible to the resident).
 * If the sender is a servant, the resident receives a push notification.
 *
 * Emits `message:new` to the ticket's Socket.IO room.
 *
 * @param {import('express').Request}  req  - Params: { id }; Body: { message, isInternal? }
 * @param {import('express').Response} res  - 201 with the created message record.
 * @param {import('express').NextFunction} next
 */
export const addMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message, isInternal = false } = req.body;

    if (!message) return res.status(400).json({ error: 'Message is required' });

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    // Determine sender identity based on the authenticated entity type
    const isServant = req.userType === 'servant';
    const senderName = isServant ? req.servant.name : req.user.name;

    const msg = await prisma.ticketMessage.create({
      data: {
        ticketId: id,
        servantId: isServant ? req.servant.id : null,
        senderType: isServant ? 'SERVANT' : 'CLIENT',
        senderName,
        message,
        // Residents cannot create internal notes regardless of what they send
        isInternal: isServant ? isInternal : false,
      },
    });

    // Notify the resident when a servant replies (not needed for resident → servant direction)
    if (isServant) {
      await createNotification(
        ticket.userId,
        ticket.id,
        'NEW_MESSAGE',
        'New Response',
        `${senderName} replied to your ticket #${ticket.ticketNumber}`
      );
    }

    // Push the new message to all clients subscribed to this ticket room
    const io = getIO();
    if (io) io.to(`ticket:${id}`).emit('message:new', msg);

    res.status(201).json(msg);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /tickets/:id/feedback
 * Allows the ticket owner to submit or update a star rating and optional comment.
 *
 * Ratings must be integers between 1 and 5.  Uses `upsert` so a second
 * submission replaces the previous one rather than creating a duplicate.
 *
 * @param {import('express').Request}  req  - Params: { id }; Body: { rating, comment? }
 * @param {import('express').Response} res  - 200 with the upserted feedback record.
 * @param {import('express').NextFunction} next
 */
export const submitFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    // Only the ticket owner may rate their experience
    if (ticket.userId !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    // Upsert so repeated submissions update rather than duplicate the record
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

/**
 * POST /tickets/:id/assign
 * Allows a servant to self-assign a ticket (e.g. from the unassigned queue).
 *
 * Increments the servant's workload counter and sets the ticket status to
 * ASSIGNED.
 *
 * @param {import('express').Request}  req  - Params: { id }
 * @param {import('express').Response} res  - 200 with the updated ticket.
 * @param {import('express').NextFunction} next
 */
export const assignTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await prisma.ticket.update({
      where: { id },
      data: { servantId: req.servant.id, status: 'ASSIGNED' },
      include: { user: true },
    });

    // Track the servant's workload so auto-assignment stays balanced
    await prisma.servant.update({
      where: { id: req.servant.id },
      data: { workload: { increment: 1 } },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /tickets/:id/escalate
 * Escalates a ticket to URGENT priority and ESCALATED status.
 *
 * Inserts a system-level thread message explaining the escalation reason,
 * notifies the resident, and broadcasts the update over Socket.IO.
 *
 * @param {import('express').Request}  req  - Params: { id }; Body: { reason? }
 * @param {import('express').Response} res  - 200 with the updated ticket.
 * @param {import('express').NextFunction} next
 */
export const escalateTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Atomically update status and priority in one write
    const ticket = await prisma.ticket.update({
      where: { id },
      data: { status: 'ESCALATED', priority: 'URGENT', escalatedAt: new Date(), escalationReason: reason || null },
      include: { user: true },
    });

    // Leave an audit trail in the message thread
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

    // Inform the resident that their ticket has been escalated
    await createNotification(
      ticket.userId,
      ticket.id,
      'ESCALATED',
      'Ticket Escalated',
      `Your ticket #${ticket.ticketNumber} has been escalated for priority handling.`
    );

    // Broadcast escalation to the ticket room and admin dashboard
    const io = getIO();
    if (io) {
      const payload = { id, status: 'ESCALATED', priority: 'URGENT' };
      io.to(`ticket:${id}`).emit('ticket:updated', payload);
      io.to('admin').emit('ticket:updated', payload);
    }

    res.json(ticket);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /tickets/classify
 * Utility endpoint that runs the AI classifier on arbitrary text and returns
 * the predicted department.  Intended for testing and debugging the classifier.
 *
 * @param {import('express').Request}  req  - Body: { text }
 * @param {import('express').Response} res  - 200 with classification result + department record.
 * @param {import('express').NextFunction} next
 */
export const classifyAndRoute = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    // Run the AI classifier and enrich the response with full department details
    const result = await classifyConcern(text);
    const dept = await prisma.department.findUnique({ where: { id: result.departmentId } });

    res.json({ ...result, department: dept });
  } catch (err) {
    next(err);
  }
};
