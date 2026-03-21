/**
 * lib/socket.js
 *
 * Creates and exports the single shared Socket.IO client instance used
 * throughout the application.
 *
 * Design decisions:
 *
 *   autoConnect: false
 *     The socket does NOT connect automatically on import.  Connection
 *     lifecycle (connect / disconnect) is managed exclusively by
 *     SocketContext.jsx, which ties the socket to the user's authentication
 *     state.  This prevents unauthenticated WebSocket connections.
 *
 *   transports: ['websocket', 'polling']
 *     Prefer the native WebSocket transport for lower latency.  Fall back to
 *     HTTP long-polling if WebSocket is unavailable (e.g. some corporate
 *     proxies or load-balancers that strip Upgrade headers).
 *
 * Deployment note:
 *   In production the Express server serves the compiled frontend, so the
 *   socket connects to the same origin automatically (no URL needed).
 *   In development, Vite's proxy configuration forwards /socket.io requests
 *   to localhost:5000 where the Express server listens.
 */

import { io } from 'socket.io-client';

// In production, the socket connects to the same origin (Express serves frontend).
// In development, Vite proxies /socket.io to localhost:5000.
const socket = io({
  autoConnect: false,                          // controlled manually by SocketContext
  transports: ['websocket', 'polling'],        // WebSocket first, polling as fallback
});

export default socket;
