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
 *   transports: ['websocket']
 *     WebSocket-only — no HTTP long-polling fallback.  On Hostinger shared
 *     hosting each HTTP connection (including polling requests) consumes an
 *     entry-process slot.  Using a single persistent WebSocket connection
 *     keeps the process count under the plan's 40-slot ceiling.  The server
 *     is likewise configured with transports: ['websocket'] so both sides
 *     are aligned.
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
  autoConnect:  false,               // controlled manually by SocketContext
  transports:   ['websocket'],       // WebSocket only — no polling (Hostinger slot limit)
});

export default socket;
