/**
 * @file tickets.js
 * @description Express router for the ticket (service-request) resource.
 *
 * Tickets are the core entity of the eGov platform. Citizens (clients) open
 * tickets to request government services; civil servants then triage, process,
 * and resolve those requests.
 *
 * Route summary
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-facing (requires `requireClient` role):
 *   POST   /                    – Create a new ticket (supports file attachments)
 *   GET    /                    – List all tickets belonging to the logged-in client
 *   GET    /:id                 – Retrieve a single ticket by ID (any authenticated user)
 *   POST   /:id/feedback        – Submit a satisfaction rating after resolution
 *   POST   /classify            – AI-assisted classification & department routing
 *
 * Servant-facing (requires `requireServant` role or general authentication):
 *   GET    /servant/assigned    – List tickets assigned to the logged-in servant
 *   PATCH  /:id/status          – Update a ticket's status (servant only)
 *   POST   /:id/message         – Append a message to a ticket thread (any auth user)
 *   PATCH  /:id/assign          – Assign a ticket to a servant (servant only)
 *   PATCH  /:id/escalate        – Escalate a ticket to a higher priority/level (servant only)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * All routes require a valid JWT, enforced by the `authenticate` middleware.
 * File uploads (attachments) are handled by multer via the `upload` middleware.
 */

import { Router } from 'express';
import {
  createTicket,
  getTickets,
  getTicket,
  updateTicketStatus,
  addMessage,
  submitFeedback,
  getServantTickets,
  assignTicket,
  escalateTicket,
  classifyAndRoute,
} from '../controllers/ticketController.js';
import { authenticate, requireClient, requireServant } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

/** Dedicated Express router instance for all /tickets endpoints. */
const router = Router();

// ─── Client routes ────────────────────────────────────────────────────────────

/**
 * POST /
 * Create a new ticket.
 * `upload.array('attachments', 5)` allows up to 5 file attachments to be
 * uploaded alongside the ticket body (multipart/form-data).
 *
 * @name CreateTicket
 * @middleware authenticate – verifies JWT and sets req.user / req.userType
 * @middleware requireClient – ensures the caller is a registered citizen
 * @middleware upload.array  – parses and stores up to 5 uploaded files
 */
router.post('/', authenticate, requireClient, upload.array('attachments', 5), createTicket);

/**
 * GET /
 * Return all tickets submitted by the currently authenticated client.
 *
 * @name GetClientTickets
 * @middleware authenticate
 * @middleware requireClient
 */
router.get('/', authenticate, requireClient, getTickets);

/**
 * GET /:id
 * Retrieve a single ticket by its unique ID.
 * Accessible by any authenticated user (client, servant, or admin).
 *
 * @name GetTicket
 * @param {string} id – Prisma CUID of the target ticket
 * @middleware authenticate
 */
router.get('/:id', authenticate, getTicket);

/**
 * POST /:id/feedback
 * Allow a client to submit feedback (star rating + comment) after a ticket
 * has been resolved. Only the ticket's owner may call this endpoint.
 *
 * @name SubmitFeedback
 * @param {string} id – CUID of the resolved ticket
 * @middleware authenticate
 * @middleware requireClient
 */
router.post('/:id/feedback', authenticate, requireClient, submitFeedback);

/**
 * POST /classify
 * Send ticket details to the AI classification layer, which returns a
 * suggested category and department, then optionally auto-routes the ticket.
 *
 * @name ClassifyAndRoute
 * @middleware authenticate
 */
router.post('/classify', authenticate, classifyAndRoute);

// ─── Servant routes ───────────────────────────────────────────────────────────

/**
 * GET /servant/assigned
 * Return the list of tickets currently assigned to the logged-in servant.
 *
 * @name GetServantTickets
 * @middleware authenticate
 * @middleware requireServant – ensures the caller is a civil servant
 */
router.get('/servant/assigned', authenticate, requireServant, getServantTickets);

/**
 * PATCH /:id/status
 * Update the workflow status of a ticket (e.g. PENDING → IN_PROGRESS → RESOLVED).
 *
 * @name UpdateTicketStatus
 * @param {string} id – CUID of the ticket to update
 * @middleware authenticate
 * @middleware requireServant
 */
router.patch('/:id/status', authenticate, requireServant, updateTicketStatus);

/**
 * POST /:id/message
 * Append a new message/note to a ticket's conversation thread.
 * Open to both clients and servants (any authenticated user), enabling
 * two-way communication on a ticket.
 *
 * @name AddMessage
 * @param {string} id – CUID of the target ticket
 * @middleware authenticate
 */
router.post('/:id/message', authenticate, upload.array('attachments', 5), addMessage);

/**
 * PATCH /:id/assign
 * Assign (or re-assign) a ticket to a specific servant.
 *
 * @name AssignTicket
 * @param {string} id – CUID of the ticket to assign
 * @middleware authenticate
 * @middleware requireServant
 */
router.patch('/:id/assign', authenticate, requireServant, assignTicket);

/**
 * PATCH /:id/escalate
 * Escalate a ticket, marking it for higher-priority handling or supervisor review.
 *
 * @name EscalateTicket
 * @param {string} id – CUID of the ticket to escalate
 * @middleware authenticate
 * @middleware requireServant
 */
router.patch('/:id/escalate', authenticate, requireServant, escalateTicket);

export default router;
