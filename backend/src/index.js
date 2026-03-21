/**
 * @file backend/src/index.js
 * @description Main Express application bootstrap for the E-Gov Aluguinsan API.
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
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { initSocket } from './lib/socket.js';

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

// Helmet sets sensible HTTP security headers (CSP, HSTS, X-Frame-Options …).
// crossOriginResourcePolicy is relaxed to 'cross-origin' so that the React
// frontend (served from a different origin in dev) can load uploaded assets.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
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

// Parse incoming JSON payloads; 10 mb cap accommodates base64-encoded file
// uploads while preventing excessively large request bodies.
app.use(express.json({ limit: '10mb' }));

// Also accept URL-encoded form bodies (e.g. legacy HTML forms).
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Static files ──────────────────────────────────────────────────────────────

// Serve user-uploaded files (profile photos, attachments) directly from the
// uploads/ directory that lives next to the backend src/ folder.
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── Health check ──────────────────────────────────────────────────────────────

// Simple liveness probe used by load balancers / uptime monitors.
// Returns HTTP 200 with a JSON body including the current server timestamp.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'E-Gov Aluguinsan API', timestamp: new Date().toISOString() });
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

  // Serve hashed static assets (JS/CSS/images) with long-term cache
  // (7 days).  Vite/CRA generate content-hashed filenames so stale-cache
  // issues do not arise when new builds are deployed.
  app.use(express.static(frontendDist, { maxAge: '7d' }));

  // SPA fallback — return index.html for every non-/api route so that React
  // Router can handle client-side navigation (e.g. direct URL access or
  // browser refresh on a deep route).
  app.get(/^(?!\/api).*/, (req, res) => {
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

// ── Start server ──────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`\n🏛️  E-Gov Aluguinsan API running on port ${PORT}`);
  console.log(`📚 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health: http://localhost:${PORT}/health\n`);
});

export default app;
