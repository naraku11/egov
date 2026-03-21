/**
 * @file app.js
 * @description Root application entry point for the E-Gov Aluguinsan platform.
 *
 * Hostinger's Node.js runtime expects a CommonJS-compatible root file.
 * Because the entire backend is written as ES Modules (ESM), this file uses
 * a dynamic `import()` call — which is valid in both CJS and ESM contexts —
 * to bootstrap the real server without converting every source file.
 *
 * Execution flow:
 *   Hostinger starts app.js  →  dynamic import resolves backend/src/index.js
 *   →  Express + Socket.IO server starts listening on $PORT.
 */

// Dynamically import the ESM backend entry point.
// If the import fails (e.g. a missing dependency or syntax error in index.js)
// the error is logged to stderr and the process exits with a non-zero code so
// the host process manager (PM2 / Hostinger daemon) can restart or alert.
import('./backend/src/index.js').catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
