// Hostinger Node.js Application entry point (CommonJS + dynamic ESM import)
import('./backend/src/index.js').catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
