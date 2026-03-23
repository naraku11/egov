/**
 * @file auth.js
 * @description Authentication and authorization middleware for the eGov API.
 *
 * Provides four Express middleware functions:
 *  - `authenticate`    – Verifies the JWT in the Authorization header and
 *                        attaches the resolved user or servant record to `req`.
 *  - `requireAdmin`    – Guards routes that require a user with the ADMIN role.
 *  - `requireServant`  – Guards routes that are accessible only to civil-servant
 *                        accounts (e.g. department staff dashboards).
 *  - `requireClient`   – Guards routes that are accessible only to regular
 *                        citizen/client accounts.
 *
 * All middleware functions follow the standard Express `(req, res, next)`
 * signature and must be used after `authenticate` when authorization checks
 * are needed.
 */

import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

/**
 * Verifies the Bearer JWT supplied in the `Authorization` header.
 *
 * On success the middleware attaches one of the following to `req`:
 *  - `req.servant` + `req.userType === 'servant'` when the token belongs to a
 *    civil-servant account (includes the related `department` record).
 *  - `req.user`    + `req.userType === 'user'`    when the token belongs to a
 *    regular citizen account.
 *
 * Responds with HTTP 401 when the token is missing, malformed, expired, or
 * does not resolve to an active database record.
 *
 * @type {import('express').RequestHandler}
 */
export const authenticate = async (req, res, next) => {
  try {
    // Read the raw Authorization header value.
    const authHeader = req.headers.authorization;

    // Reject requests that carry no Bearer token at all.
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Extract the token string that follows "Bearer ".
    const token = authHeader.split(' ')[1];

    // Verify signature and expiry using the shared application secret.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Could be user or servant
    if (decoded.type === 'servant') {
      // Fetch the servant record and eagerly include their department so that
      // route handlers can check department-level permissions without an extra
      // database query.
      const servant = await prisma.servant.findUnique({
        where: { id: decoded.id },
        include: { department: true },
      });

      // The token is structurally valid but the servant no longer exists in the
      // database (e.g. account was deleted).
      if (!servant) return res.status(401).json({ error: 'Invalid token' });

      req.servant = servant;      // Attach the full servant record for downstream use.
      req.userType = 'servant';   // Mark the request type so authorization guards work.
    } else {
      // Fetch the regular citizen/user record — exclude password hash for security.
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, name: true, email: true, phone: true, role: true, barangay: true, address: true, isVerified: true, language: true, avatarUrl: true, createdAt: true, updatedAt: true },
      });

      // Token is valid but the user account no longer exists.
      if (!user) return res.status(401).json({ error: 'Invalid token' });

      req.user = user;          // Attach the full user record for downstream use.
      req.userType = 'user';    // Mark the request type so authorization guards work.
    }

    // All checks passed – hand control to the next middleware or route handler.
    next();
  } catch (err) {
    // jwt.verify throws for expired, tampered, or otherwise invalid tokens.
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Authorization guard: allows only users whose `role` is `'ADMIN'`.
 *
 * Must be placed after `authenticate` in the middleware chain.
 * Responds with HTTP 403 if the requester is a servant or a non-admin user.
 *
 * @type {import('express').RequestHandler}
 */
export const requireAdmin = (req, res, next) => {
  // Servants cannot be admins; also rejects unauthenticated requests.
  if (req.userType !== 'user' || req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

/**
 * Authorization guard: allows only civil-servant accounts.
 *
 * Must be placed after `authenticate` in the middleware chain.
 * Responds with HTTP 403 if the requester is a regular citizen user.
 *
 * @type {import('express').RequestHandler}
 */
export const requireServant = (req, res, next) => {
  // Only requests authenticated as 'servant' are allowed through.
  if (req.userType !== 'servant') {
    return res.status(403).json({ error: 'Servant access required' });
  }
  next();
};

/**
 * Authorization guard: allows only regular citizen/client accounts.
 *
 * Must be placed after `authenticate` in the middleware chain.
 * Responds with HTTP 403 if the requester is a servant account.
 *
 * @type {import('express').RequestHandler}
 */
export const requireClient = (req, res, next) => {
  // Only requests authenticated as a regular 'user' (citizen) are allowed.
  if (req.userType !== 'user') {
    return res.status(403).json({ error: 'Client access required' });
  }
  next();
};
