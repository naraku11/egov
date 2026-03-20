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

const router = Router();

// Client routes
router.post('/', authenticate, requireClient, upload.array('attachments', 5), createTicket);
router.get('/', authenticate, requireClient, getTickets);
router.get('/:id', authenticate, getTicket);
router.post('/:id/feedback', authenticate, requireClient, submitFeedback);
router.post('/classify', authenticate, classifyAndRoute);

// Servant routes
router.get('/servant/assigned', authenticate, requireServant, getServantTickets);
router.patch('/:id/status', authenticate, requireServant, updateTicketStatus);
router.post('/:id/message', authenticate, addMessage);
router.patch('/:id/assign', authenticate, requireServant, assignTicket);
router.patch('/:id/escalate', authenticate, requireServant, escalateTicket);

export default router;
