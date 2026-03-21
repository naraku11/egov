/**
 * @file notification.js
 * @description Notification-dispatch service for the eGov platform.
 *
 * Provides three notification channels:
 *
 *  1. **In-app / real-time** (`createNotification`) – Persists a notification
 *     record to the database via Prisma and instantly pushes it to the relevant
 *     user's Socket.IO room so connected clients receive it without polling.
 *
 *  2. **Email** (`sendEmailNotification`) – Stub for an email delivery
 *     integration (e.g. Nodemailer + SMTP / SendGrid).  Logs to stdout in the
 *     current implementation; replace the body with a real transport call
 *     before going to production.
 *
 *  3. **SMS** (`sendSmsNotification`) – Stub for an SMS delivery integration
 *     (e.g. Twilio).  Logs to stdout in the current implementation; replace
 *     the body with a real provider call before going to production.
 *
 * All exported functions are fire-and-forget – callers do not need to await a
 * meaningful return value (errors in `createNotification` are caught and logged
 * internally rather than propagated).
 */

import prisma from '../lib/prisma.js';
import { getIO } from '../lib/socket.js';

/**
 * Creates a persistent in-app notification and pushes it to the user in
 * real-time via Socket.IO.
 *
 * The notification is written to the database first to guarantee durability,
 * then emitted on the Socket.IO room `user:<userId>`.  If no Socket.IO server
 * is initialised (e.g. during unit tests) the real-time push is silently
 * skipped.  Any database error is caught and logged so that a notification
 * failure never crashes the calling request.
 *
 * @param {string} userId   - Database ID of the recipient user.
 * @param {string} ticketId - Database ID of the ticket this notification relates to.
 * @param {string} type     - Notification type identifier (e.g. `'TICKET_UPDATED'`).
 * @param {string} title    - Short notification title displayed in the UI.
 * @param {string} message  - Full notification body text.
 * @returns {Promise<void>}
 */
export const createNotification = async (userId, ticketId, type, title, message) => {
  try {
    // Persist the notification so it appears in the user's notification history
    // even if they are offline at the moment it is created.
    const notif = await prisma.notification.create({
      data: { userId, ticketId, type, title, message },
    });

    // Attempt a real-time push via Socket.IO to the user's dedicated room.
    const io = getIO();
    if (io) io.to(`user:${userId}`).emit('notification:new', notif);
    // If io is null the user is offline; they will see the notification on
    // their next login via the persisted database record.
  } catch (err) {
    // Log the failure but do not re-throw – a notification error should never
    // cause the parent operation (e.g. ticket status update) to fail.
    console.error('Failed to create notification:', err);
  }
};

/**
 * Sends an email notification to the specified address.
 *
 * **Production TODO:** Replace the `console.log` stub with a real email
 * transport such as Nodemailer (SMTP) or a transactional email provider
 * (SendGrid, Mailgun, AWS SES, etc.).
 *
 * @param {string} to      - Recipient email address.
 * @param {string} subject - Email subject line.
 * @param {string} html    - HTML body content of the email.
 * @returns {Promise<void>}
 */
export const sendEmailNotification = async (to, subject, html) => {
  // In production, integrate nodemailer here
  console.log(`📧 Email to ${to}: ${subject}`);
};

/**
 * Sends an SMS notification to the specified phone number.
 *
 * **Production TODO:** Replace the `console.log` stub with a real SMS provider
 * integration such as Twilio, Vonage (Nexmo), or a local Philippine carrier
 * gateway API.
 *
 * @param {string} to      - Recipient phone number (E.164 format recommended).
 * @param {string} message - SMS body text (keep under 160 characters to avoid
 *   multi-part message charges).
 * @returns {Promise<void>}
 */
export const sendSmsNotification = async (to, message) => {
  // In production, integrate Twilio here
  console.log(`📱 SMS to ${to}: ${message}`);
};
