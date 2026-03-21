/**
 * @file notifications.js
 * @description Express router for the in-app notification resource.
 *
 * Notifications are generated server-side when significant ticket events occur
 * (e.g. status change, new message, assignment). They are surfaced to the
 * citizen (client) through this API so the frontend can display an unread
 * badge and a notification list.
 *
 * Only users of type "user" (i.e. citizens) receive notifications via this
 * module. Servant / admin sessions receive an empty list to avoid confusion.
 *
 * Route summary
 * ─────────────────────────────────────────────────────────────────────────────
 * Authenticated (any role, but notifications only populated for "user" type):
 *   GET    /           – Fetch the 50 most recent notifications for the caller
 *   PATCH  /:id/read   – Mark a single notification as read
 *   PATCH  /read-all   – Mark all unread notifications for the caller as read
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * All routes require a valid JWT, enforced by the `authenticate` middleware.
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

/** Dedicated Express router instance for all /notifications endpoints. */
const router = Router();

/**
 * GET /
 * Return the 50 most recent notifications belonging to the logged-in user,
 * ordered newest-first.
 *
 * Servants and admins (`req.userType !== 'user'`) receive an empty array
 * because the notification model is scoped to citizen accounts only.
 *
 * @name GetNotifications
 * @access Authenticated (citizens only — others receive [])
 * @middleware authenticate
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    // Non-citizen sessions (servant / admin) do not have notifications — return early
    if (req.userType !== 'user') return res.json([]);

    const notifications = await prisma.notification.findMany({
      where:   { userId: req.user.id },    // scoped strictly to the authenticated user
      orderBy: { createdAt: 'desc' },      // most recent notifications first
      take:    50,                          // cap result set to avoid over-fetching
    });
    res.json(notifications);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /:id/read
 * Mark a single notification as read by setting `isRead = true`.
 * This is called when the user clicks on a specific notification item.
 *
 * @name MarkNotificationRead
 * @access Authenticated
 * @middleware authenticate
 * @param {string} id – Prisma CUID of the notification to mark as read
 */
router.patch('/:id/read', authenticate, async (req, res, next) => {
  try {
    await prisma.notification.update({
      where: { id: req.params.id },
      data:  { isRead: true },            // flip the read flag
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /read-all
 * Bulk-mark every unread notification for the logged-in user as read.
 * Typically triggered when the user opens the notification panel.
 *
 * Servants and admins receive a no-op success response because they have
 * no notifications to update.
 *
 * @name MarkAllNotificationsRead
 * @access Authenticated (no-op for non-citizen sessions)
 * @middleware authenticate
 */
router.patch('/read-all', authenticate, async (req, res, next) => {
  try {
    // Non-citizen sessions have no notifications; return success without a DB write
    if (req.userType !== 'user') return res.json({ success: true });

    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false }, // only touch unread records
      data:  { isRead: true },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
