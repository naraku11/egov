/**
 * @file backend/src/index.js
 * @description Main Express application bootstrap for the E-Gov Aloguinsan API.
 *
 * Responsibilities:
 *  - Loads environment variables via dotenv before any other module runs.
 *  - Creates the Express app and wraps it in a plain Node.js HTTP server so
 *    that Socket.IO can share the same port.
 *  - Registers global middleware (security headers, CORS, rate limiting,
 *    body parsing, static file serving).
 *  - Mounts all feature routers under /api/*.
 *  - In production, serves the compiled React SPA and provides an HTML
 *    fallback for client-side routing.
 *  - Registers the centralised error handler as the last middleware.
 *  - Starts listening and logs the active port / environment.
 */

// Load .env variables into process.env as early as possible so that every
// subsequent import can read them (e.g. DATABASE_URL used by Prisma).
import 'dotenv/config';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { initSocket, getIO } from './lib/socket.js';
import prisma from './lib/prisma.js';
import { notifyServant } from './services/notification.js';

// ── Feature routers ───────────────────────────────────────────────────────────
import authRoutes from './routes/auth.js';
import ticketRoutes from './routes/tickets.js';
import departmentRoutes from './routes/departments.js';
import servantRoutes from './routes/servants.js';
import adminRoutes from './routes/admin.js';
import notificationRoutes from './routes/notifications.js';
import announcementRoutes from './routes/announcements.js';
import directoryRoutes from './routes/directory.js';
import { errorHandler } from './middleware/errorHandler.js';

// ESM does not expose __filename / __dirname natively; reconstruct them from
// the module's URL so that path.join() calls work correctly.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create the Express application instance.
const app = express();

// Wrap Express in a plain HTTP server so Socket.IO can attach to the same port.
const httpServer = createServer(app);

// Initialise Socket.IO and attach it to the shared HTTP server.
initSocket(httpServer);

// Fall back to port 5000 when PORT is not provided by the host environment.
const PORT = process.env.PORT || 5000;

// Trust Hostinger/nginx reverse proxy for accurate IP-based rate limiting
// (without this, req.ip would always be the proxy's IP, not the real client).
app.set('trust proxy', 1);

// ── Security middleware ───────────────────────────────────────────────────────

// Compress all HTTP responses (gzip/brotli) — typically 60-80% size reduction
// for JSON and HTML payloads. Must come before route handlers.
app.use(compression());

// Helmet sets sensible HTTP security headers (CSP, HSTS, X-Frame-Options …).
// crossOriginResourcePolicy is relaxed to 'cross-origin' so that the React
// frontend (served from a different origin in dev) can load uploaded assets.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// Allow the configured frontend origin to make credentialed requests (cookies,
// auth headers).  CLIENT_URL must be set in .env for production deployments.
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────

// General API limiter: 200 requests per 15 minutes per IP.
// Applied to all /api/* routes as a broad abuse-prevention measure.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api', limiter);

// Stricter limiter for authentication endpoints (login, register, password
// reset) to slow down credential-stuffing and brute-force attacks.
// 20 attempts per 15 minutes per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts, please try again later.' },
});

// ── Body parsing ──────────────────────────────────────────────────────────────

// Parse incoming JSON payloads. 1 MB cap — file uploads go through Multer
// (multipart), not JSON body, so 10 MB was unnecessarily large and risked
// exhausting heap memory on shared hosting with a single large request.
app.use(express.json({ limit: '1mb' }));

// Also accept URL-encoded form bodies (e.g. legacy HTML forms).
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Static files ──────────────────────────────────────────────────────────────

// Serve user-uploaded files (profile photos, attachments) directly from the
// uploads/ directory that lives next to the backend src/ folder.
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  maxAge: '7d',   // uploaded files are immutable (new uploads get new filenames)
  etag: true,
}));

// ── Health check ──────────────────────────────────────────────────────────────

// Simple liveness probe used by load balancers / uptime monitors.
// Cached for 15 seconds so frequent polling does not hammer the database —
// on shared hosting this was generating ~1 400 unnecessary DB queries/day.
let _healthCache = null;
let _healthCacheTime = 0;
const HEALTH_CACHE_TTL = 15_000; // 15 seconds

app.get('/health', async (req, res) => {
  const now = Date.now();
  if (_healthCache && now - _healthCacheTime < HEALTH_CACHE_TTL) {
    return res.status(_healthCache.status === 'ok' ? 200 : 503).json({
      ..._healthCache,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()) + 's',
    });
  }

  const health = {
    status: 'ok',
    service: 'E-Gov Aloguinsan API',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()) + 's',
    environment: process.env.NODE_ENV || 'development',
    checks: {},
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = { status: 'ok' };
  } catch (err) {
    health.checks.database = { status: 'error', message: err.message };
    health.status = 'degraded';
  }

  const io = getIO();
  health.checks.socketio = { status: io ? 'ok' : 'unavailable' };

  _healthCache = health;
  _healthCacheTime = now;

  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

// ── API Routes ────────────────────────────────────────────────────────────────

// Auth routes use the stricter authLimiter in addition to the global limiter.
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/servants', servantRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/directory', directoryRoutes);

// ── Production: serve built React frontend ────────────────────────────────────
// Must come AFTER all /api routes so the SPA fallback doesn't swallow API 404s.
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');

  // Kill stale service workers — serve a self-destructing SW and no-op workbox
  // The old PWA build registered sw.js which imported workbox-*.js. Both must
  // return valid JS that nukes the old caches and unregisters the SW.
  const swKill = `
self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function() {
  caches.keys().then(function(names) {
    names.forEach(function(n) { caches.delete(n); });
  });
  self.registration.unregister().then(function() {
    self.clients.matchAll({ type: 'window' }).then(function(clients) {
      clients.forEach(function(c) { c.navigate(c.url); });
    });
  });
});`;

  app.get('/sw.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(swKill);
  });

  // The old SW imports this workbox file — must return empty valid JS
  app.get(/^\/workbox-.*\.js$/, (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send('// workbox removed');
  });

  // Old registerSW.js — return empty
  app.get('/registerSW.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send('// removed');
  });

  // Old manifest — return empty
  app.get('/manifest.webmanifest', (req, res) => {
    res.set('Content-Type', 'application/manifest+json');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({});
  });

  // Hashed assets (JS/CSS) — long cache (7 days), safe because filenames change on rebuild
  app.use('/assets', express.static(path.join(frontendDist, 'assets'), { maxAge: '7d' }));

  // Everything else in dist (favicon, manifest, icons) — no cache for HTML
  app.use(express.static(frontendDist, {
    maxAge: '0',
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
      }
    },
  }));

  // Return 404 for missing asset files instead of serving index.html
  // (prevents MIME type mismatch when old hashed filenames are requested)
  app.use('/assets', (req, res) => {
    res.status(404).send('Not found');
  });

  // SPA fallback — return index.html with no-cache for every non-/api, non-/assets route
  app.get(/^(?!\/(api|assets)).*/, (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ── Catch-all 404 ─────────────────────────────────────────────────────────────

// Any request that fell through all the routers above is unknown.
// In production this only fires for /api/* paths (SPA fallback handles the
// rest); in development it fires for all unrecognised routes.
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Centralised error handler ─────────────────────────────────────────────────

// Must be registered last so it can catch errors forwarded via next(err) from
// any of the route handlers or middleware above.
app.use(errorHandler);

// ── Process-level panic recovery ─────────────────────────────────────────────
// Prisma's Rust query engine can panic on Hostinger shared hosting (e.g.
// "PANIC: timer has gone away" due to resource limits).  If the panic reaches
// here rather than the Express error handler (e.g. from a background task or
// a promise that was never awaited), log it and exit so PM2 restarts cleanly.
const isPrismaPanic = (err) =>
  err?.name === 'PrismaClientRustPanicError' ||
  (typeof err?.message === 'string' && err.message.includes('PANIC'));

process.on('uncaughtException', (err) => {
  if (isPrismaPanic(err)) {
    console.error('FATAL uncaughtException — Prisma panic, restarting:', err.message);
    process.exit(1);
  }
  console.error('uncaughtException:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  if (isPrismaPanic(reason)) {
    console.error('FATAL unhandledRejection — Prisma panic, restarting:', reason?.message);
    process.exit(1);
  }
  console.error('unhandledRejection:', reason);
});

// ── Start server ──────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  // On Hostinger shared hosting every open HTTP connection counts as an "entry
  // process". The plan limit is 40 — all settings below are tuned to keep the
  // active connection count well under that ceiling.
  //
  // maxConnections (35) — hard-cap concurrent TCP connections at 35, leaving a
  //   5-slot safety margin below the 40-process limit. New connections above
  //   this number are queued by the OS and admitted as slots free up.
  // keepAliveTimeout (5 s) — close idle persistent connections quickly so slots
  //   are freed well before the host's reverse-proxy idle timeout (~60 s).
  // headersTimeout (10 s) — must be strictly above keepAliveTimeout to prevent
  //   a Node.js race where the socket closes before headers are fully sent.
  // requestTimeout (25 s) — abort any request that takes more than 25 seconds
  //   end-to-end (DB heavy queries and file uploads should finish in time).
  httpServer.maxConnections   = 35;
  httpServer.keepAliveTimeout = 5_000;
  httpServer.headersTimeout   = 10_000;
  httpServer.requestTimeout   = 25_000;

  console.log(`\n🏛️  E-Gov Aloguinsan API running on port ${PORT}`);
  console.log(`📚 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health: http://localhost:${PORT}/health\n`);

  // ── SLA breach notification scheduler ──────────────────────────────────────
  // Runs every 10 minutes; finds newly breached (unresolved) tickets whose
  // SLA deadline passed in the last polling window, then notifies the assigned
  // servant via Socket.IO and broadcasts to the admin room.
  // Uses an in-memory Set to avoid re-notifying the same ticket within a session.
  const _slaNotified = new Set();

  const checkSlaBreaches = async () => {
    try {
      const io = getIO();
      if (!io) return;

      const breached = await prisma.ticket.findMany({
        where: {
          slaDeadline: { lt: new Date() },
          status:      { notIn: ['RESOLVED', 'CLOSED'] },
        },
        select: { id: true, ticketNumber: true, title: true, servantId: true, priority: true },
      });

      for (const ticket of breached) {
        if (_slaNotified.has(ticket.id)) continue; // already notified this session
        _slaNotified.add(ticket.id);

        // Notify the assigned servant (real-time, no DB persist)
        if (ticket.servantId) {
          notifyServant(ticket.servantId, {
            ticketId: ticket.id,
            type:     'SLA_BREACH',
            title:    'SLA Breach Alert',
            message:  `Ticket ${ticket.ticketNumber} has exceeded its SLA deadline.`,
          });
        }

        // Broadcast to all connected admin clients
        io.to('admin').emit('sla:breach', {
          ticketId:     ticket.id,
          ticketNumber: ticket.ticketNumber,
          title:        ticket.title,
          priority:     ticket.priority,
        });
      }
    } catch (err) {
      console.error('SLA check error:', err.message);
    }
  };

  // Run once immediately, then every 10 minutes
  checkSlaBreaches();
  setInterval(checkSlaBreaches, 10 * 60 * 1000);
});

export default app;
