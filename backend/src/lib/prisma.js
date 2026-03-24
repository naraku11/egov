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

// Reuse an existing client stored on the global object (dev hot-reload guard),
// or create a fresh one if none exists yet.
// On shared hosting (Hostinger), limit the connection pool to 5 connections
// to avoid exhausting the host's MySQL connection limit.
const prisma = globalThis.__prisma ?? new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
        ? process.env.DATABASE_URL + (process.env.DATABASE_URL.includes('?') ? '&' : '?') + 'connection_limit=5&pool_timeout=10'
        : undefined,
    },
  },
});

// Only persist the instance on globalThis in non-production environments.
// In production each deployment starts a clean process, so the guard is
// unnecessary and polluting the global namespace is avoided.
if (process.env.NODE_ENV !== 'production') globalThis.__prisma = prisma;

export default prisma;
