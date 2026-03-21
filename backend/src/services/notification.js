/**
 * @file notification.js
 * @description Notification service — in-app (Socket.IO + DB), email (SMTP), and SMS (stub).
 */

import nodemailer from 'nodemailer';
import prisma from '../lib/prisma.js';
import { getIO } from '../lib/socket.js';

// ─── SMTP Transport (lazy-initialized on first send) ─────────────────────────

let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.hostinger.com',
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
};

// ─── HTML Email Template ─────────────────────────────────────────────────────

/**
 * Wraps content in a branded HTML email layout.
 *
 * @param {string} title   - Email heading
 * @param {string} body    - HTML body content
 * @param {string} [cta]   - Optional call-to-action URL
 * @param {string} [ctaLabel] - CTA button text
 * @returns {string} Full HTML email string
 */
const emailTemplate = (title, body, cta, ctaLabel) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:24px 32px;text-align:center">
          <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600">Municipality of Aluguinsan</h1>
          <p style="margin:4px 0 0;color:#93c5fd;font-size:12px">E-Government Assistance System</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px">
          <h2 style="margin:0 0 16px;color:#111827;font-size:20px">${title}</h2>
          <div style="color:#374151;font-size:14px;line-height:1.6">${body}</div>
          ${cta ? `
          <div style="margin:24px 0;text-align:center">
            <a href="${cta}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">${ctaLabel || 'View Details'}</a>
          </div>` : ''}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
          <p style="margin:0;color:#9ca3af;font-size:11px">Municipality of Aluguinsan, Province of Cebu, Philippines</p>
          <p style="margin:4px 0 0;color:#9ca3af;font-size:11px">This is an automated message — please do not reply directly.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ─── Email Sender ────────────────────────────────────────────────────────────

/**
 * Sends an HTML email via the configured SMTP transport.
 * Errors are caught and logged — never thrown to callers.
 *
 * @param {string} to      - Recipient email address
 * @param {string} subject - Email subject line
 * @param {string} html    - Full HTML body
 */
export const sendEmailNotification = async (to, subject, html) => {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  if (!to || !from || !process.env.SMTP_USER) return;
  try {
    await getTransporter().sendMail({
      from: `"Aluguinsan E-Gov" <${from}>`,
      to,
      subject,
      html,
    });
    console.log(`📧 Email sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`📧 Email failed to ${to}:`, err.message);
  }
};

// ─── In-App Notification ─────────────────────────────────────────────────────

/**
 * Creates an in-app notification (DB + Socket.IO push).
 * Also sends an email if the user has an email address on file.
 *
 * @param {string} userId   - Recipient user ID
 * @param {string} ticketId - Related ticket ID
 * @param {string} type     - Notification type code
 * @param {string} title    - Short title
 * @param {string} message  - Full message body
 */
export const createNotification = async (userId, ticketId, type, title, message) => {
  try {
    const notif = await prisma.notification.create({
      data: { userId, ticketId, type, title, message },
    });

    const io = getIO();
    if (io) io.to(`user:${userId}`).emit('notification:new', notif);

    // Also send email to the user if they have one
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (user?.email) {
      const clientUrl = process.env.CLIENT_URL || 'https://aluguinsan-egov.online';
      const ticketUrl = ticketId ? `${clientUrl}/track?ticket=${ticketId}` : clientUrl;
      const html = emailTemplate(
        title,
        `<p>Hi <strong>${user.name}</strong>,</p><p>${message}</p>`,
        ticketUrl,
        'View Ticket'
      );
      sendEmailNotification(user.email, `[E-Gov] ${title}`, html);
    }
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
};

// ─── Standalone Email Helpers ────────────────────────────────────────────────

/**
 * Sends a password reset code email.
 *
 * @param {string} to   - Recipient email address
 * @param {string} name - Recipient name
 * @param {string} code - 6-digit reset code
 */
export const sendResetCodeEmail = async (to, name, code) => {
  const html = emailTemplate(
    'Password Reset Code',
    `<p>Hi <strong>${name}</strong>,</p>
     <p>You requested a password reset for your E-Gov account. Use the code below to reset your password:</p>
     <div style="margin:24px 0;text-align:center">
       <span style="display:inline-block;background:#f3f4f6;padding:16px 32px;border-radius:8px;font-size:32px;font-weight:700;letter-spacing:8px;color:#1e3a5f">${code}</span>
     </div>
     <p style="color:#6b7280;font-size:13px">This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>`
  );
  await sendEmailNotification(to, '[E-Gov] Password Reset Code', html);
};

/**
 * Sends a welcome email after registration.
 *
 * @param {string} to   - Recipient email
 * @param {string} name - Recipient name
 */
export const sendWelcomeEmail = async (to, name) => {
  const clientUrl = process.env.CLIENT_URL || 'https://aluguinsan-egov.online';
  const html = emailTemplate(
    'Welcome to E-Gov Aluguinsan!',
    `<p>Hi <strong>${name}</strong>,</p>
     <p>Thank you for registering with the Municipality of Aluguinsan E-Government Assistance System.</p>
     <p>You can now:</p>
     <ul style="color:#374151;font-size:14px;line-height:1.8">
       <li>Submit concerns and service requests</li>
       <li>Track your tickets in real-time</li>
       <li>Receive updates directly from municipal staff</li>
     </ul>`,
    clientUrl,
    'Go to Portal'
  );
  await sendEmailNotification(to, '[E-Gov] Welcome to Aluguinsan E-Gov', html);
};

/**
 * Sends a notification email to a servant when a ticket is assigned.
 *
 * @param {string} to           - Servant email
 * @param {string} servantName  - Servant's name
 * @param {object} ticket       - Ticket object with ticketNumber, title, priority
 */
export const sendTicketAssignedEmail = async (to, servantName, ticket) => {
  const html = emailTemplate(
    'New Ticket Assigned',
    `<p>Hi <strong>${servantName}</strong>,</p>
     <p>A new ticket has been assigned to you:</p>
     <table style="width:100%;border-collapse:collapse;margin:16px 0">
       <tr><td style="padding:8px 12px;background:#f9fafb;font-weight:600;width:120px;font-size:13px">Ticket #</td>
           <td style="padding:8px 12px;font-size:13px">${ticket.ticketNumber}</td></tr>
       <tr><td style="padding:8px 12px;background:#f9fafb;font-weight:600;font-size:13px">Subject</td>
           <td style="padding:8px 12px;font-size:13px">${ticket.title}</td></tr>
       <tr><td style="padding:8px 12px;background:#f9fafb;font-weight:600;font-size:13px">Priority</td>
           <td style="padding:8px 12px;font-size:13px"><span style="color:${ticket.priority === 'URGENT' ? '#dc2626' : '#2563eb'};font-weight:600">${ticket.priority}</span></td></tr>
     </table>
     <p>Please review and respond promptly.</p>`
  );
  await sendEmailNotification(to, `[E-Gov] Ticket ${ticket.ticketNumber} Assigned`, html);
};

// ─── OTP Email ───────────────────────────────────────────────────────────────

/**
 * Sends an OTP verification code via email.
 *
 * @param {string} to   - Recipient email address
 * @param {string} name - Recipient name
 * @param {string} code - 6-digit OTP code
 */
export const sendOtpEmail = async (to, name, code) => {
  const html = emailTemplate(
    'Verification Code',
    `<p>Hi <strong>${name}</strong>,</p>
     <p>Your one-time verification code is:</p>
     <div style="margin:24px 0;text-align:center">
       <span style="display:inline-block;background:#f3f4f6;padding:16px 32px;border-radius:8px;font-size:32px;font-weight:700;letter-spacing:8px;color:#1e3a5f">${code}</span>
     </div>
     <p style="color:#6b7280;font-size:13px">This code expires in 5 minutes. If you didn't request this, you can safely ignore this message.</p>`
  );
  await sendEmailNotification(to, '[E-Gov] Verification Code', html);
};

// ─── SMS (Semaphore) ─────────────────────────────────────────────────────────

/**
 * Sends an SMS notification via Semaphore (semaphore.co) — a Philippine SMS gateway.
 * Falls back to console logging when SEMAPHORE_API_KEY is not configured.
 *
 * @param {string} to      - Recipient phone number (09xx or +639xx format)
 * @param {string} message - SMS body text
 * @returns {Promise<boolean>} true if sent successfully
 */
export const sendSmsNotification = async (to, message) => {
  const apiKey = process.env.SEMAPHORE_API_KEY;
  if (!apiKey || !to) {
    console.log(`📱 SMS (no provider): ${to}: ${message}`);
    return false;
  }

  try {
    // Normalize PH phone: +639xx → 09xx, keep 09xx as-is
    const phone = to.startsWith('+63') ? '0' + to.slice(3) : to;

    const res = await fetch('https://api.semaphore.co/api/v4/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: apiKey,
        number: phone,
        message,
        sendername: process.env.SEMAPHORE_SENDER_NAME || 'EGOV',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`📱 SMS failed to ${phone}:`, err);
      return false;
    }

    console.log(`📱 SMS sent to ${phone}`);
    return true;
  } catch (err) {
    console.error(`📱 SMS error to ${to}:`, err.message);
    return false;
  }
};
