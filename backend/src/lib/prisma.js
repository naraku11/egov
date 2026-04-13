/**
 * @file backend/src/lib/prisma.js
 * @description Singleton Prisma Client instance shared across the application.
 *
 * Why a singleton?
 * Prisma opens a connection pool when PrismaClient is instantiated. Creating
 * multiple instances (one per module import) would exhaust the database's
 * connection limit. By exporting a single shared instance every part of the
 * codebase reuses the same pool.
 *
 * Hot-reload safety (development only):
 * Node.js module caching is reset when tools like nodemon or ts-node restart
 * the process, which would normally create a new PrismaClient — and therefore
 * a new pool — on every file-save. Storing the instance on `globalThis`
 * preserves it across module re-evaluations within the same process lifetime,
 * preventing pool exhaustion during active development.
 * In production the guard is skipped because the process is never hot-reloaded.
 */

import { PrismaClient } from '@prisma/client';

/**
 * Build the DATABASE_URL with Hostinger-safe connection parameters.
 *
 * connection_limit=1  — single connection; the Rust query engine manages its
 *   own internal pool, so one external slot is sufficient and avoids exhausting
 *   Hostinger's per-account MySQL connection cap.
 * pool_timeout=15     — wait up to 15 s for a free slot before giving up.
 * connect_timeout=10  — abort the initial TCP handshake after 10 s.
 *
 * NOTE: socket_timeout was deliberately removed.  It is not a valid MySQL
 * connection-string parameter for Prisma and was causing the Rust query engine
 * to panic ("PANIC: timer has gone away") when MySQL dropped an idle connection
 * and the 30-second socket timer subsequently fired on the dead socket.
 * Connection freshness is now maintained by the explicit keepalive ping that
 * runs every 25 seconds inside the server startup block.
 */
function buildUrl() {
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}connection_limit=1&pool_timeout=15&connect_timeout=10`;
}

function createClient() {
  return new PrismaClient({
    datasources: { db: { url: buildUrl() } },
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  });
}

// Reuse an existing client stored on globalThis (dev hot-reload guard),
// or create a fresh one.
const prisma = globalThis.__prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalThis.__prisma = prisma;

export default prisma;
