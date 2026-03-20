import prisma from '../lib/prisma.js';
import { getIO } from '../lib/socket.js';

export const createNotification = async (userId, ticketId, type, title, message) => {
  try {
    const notif = await prisma.notification.create({
      data: { userId, ticketId, type, title, message },
    });
    const io = getIO();
    if (io) io.to(`user:${userId}`).emit('notification:new', notif);
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
};

export const sendEmailNotification = async (to, subject, html) => {
  // In production, integrate nodemailer here
  console.log(`📧 Email to ${to}: ${subject}`);
};

export const sendSmsNotification = async (to, message) => {
  // In production, integrate Twilio here
  console.log(`📱 SMS to ${to}: ${message}`);
};
