/**
 * @file errorHandler.js
 * @description Centralised Express error-handling middleware for the eGov API.
 *
 * This module exports a single four-argument Express error handler that should
 * be registered as the **last** middleware in `app.js` (after all routes).
 * It maps well-known error types and Prisma error codes to appropriate HTTP
 * status codes and returns a consistent `{ error: string }` JSON body so that
 * API clients always receive a predictable error shape.
 *
 * Handled error categories:
 *  - `ValidationError`   → 400 Bad Request
 *  - Multer file errors  → 400 Bad Request
 *  - Prisma P2002        → 409 Conflict  (unique-constraint violation)
 *  - Prisma P2025        → 404 Not Found (record does not exist)
 *  - Everything else     → `err.status` or 500 Internal Server Error
 */

/**
 * Express error-handling middleware.
 *
 * Logs the full error to stderr, then sends a structured JSON response whose
 * HTTP status and message reflect the specific error type.
 *
 * @param {Error & { name?: string; code?: string; status?: number }} err
 *   The error object forwarded by Express (via `next(err)`).
 * @param {import('express').Request}  req  - Incoming HTTP request.
 * @param {import('express').Response} res  - Outgoing HTTP response.
 * @param {import('express').NextFunction} next - Next middleware (required by
 *   Express to recognise the function as an error handler; not called here).
 */
export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // --- Input / validation failures ---
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  // --- Multer errors ---
  if (err.name === 'MulterError' || err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: err.message || 'File upload error' });
  }

  // --- Prisma ORM error codes ---

  // P2002: Unique constraint violation
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Record already exists' });
  }

  // P2025: Record not found
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }

  // PrismaClientRustPanicError — the query engine has crashed (e.g. Hostinger's
  // "PANIC: timer has gone away").  The engine cannot recover; send a 503 to
  // the client then exit so PM2 / the process manager restarts the app cleanly.
  if (
    err.name === 'PrismaClientRustPanicError' ||
    (err.message && err.message.includes('PANIC'))
  ) {
    console.error('FATAL: Prisma engine panic — restarting process');
    try { res.status(503).json({ error: 'Server restarting, please retry in a moment' }); } catch {}
    setTimeout(() => process.exit(1), 500);
    return;
  }

  // --- Catch-all ---
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
};
