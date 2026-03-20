import 'dotenv/config';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { initSocket } from './lib/socket.js';

import authRoutes from './routes/auth.js';
import ticketRoutes from './routes/tickets.js';
import departmentRoutes from './routes/departments.js';
import servantRoutes from './routes/servants.js';
import adminRoutes from './routes/admin.js';
import notificationRoutes from './routes/notifications.js';
import announcementRoutes from './routes/announcements.js';
import directoryRoutes from './routes/directory.js';
import { errorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
initSocket(httpServer);
const PORT = process.env.PORT || 5000;

// Trust Hostinger/nginx reverse proxy for accurate IP-based rate limiting
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts, please try again later.' },
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'E-Gov Aluguinsan API', timestamp: new Date().toISOString() });
});

// API Routes
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
  app.use(express.static(frontendDist, { maxAge: '7d' }));
  // SPA fallback — return index.html for every non-/api route
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// 404 handler (API routes only in production; all routes in development)
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use(errorHandler);

httpServer.listen(PORT, () => {
  console.log(`\n🏛️  E-Gov Aluguinsan API running on port ${PORT}`);
  console.log(`📚 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health: http://localhost:${PORT}/health\n`);
});

export default app;
