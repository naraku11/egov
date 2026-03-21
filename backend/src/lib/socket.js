/**
 * @file backend/src/lib/socket.js
 * @description Socket.IO server initialisation and module-level accessor.
 *
 * This module owns the single Socket.IO `Server` instance (`io`) for the
 * whole application. It exports two functions:
 *
 *  - `initSocket(httpServer)` — called once at startup (in index.js) to
 *    attach Socket.IO to the shared HTTP server and register global event
 *    handlers.
 *
 *  - `getIO()` — called anywhere in the codebase (e.g. inside route handlers
 *    or service functions) to obtain the live `io` instance so that the server
 *    can push real-time events to connected clients.
 *
 * Room-based messaging model:
 * Clients join named rooms (e.g. a ticket ID or a user ID) after connecting.
 * The server then emits targeted events to a room rather than broadcasting to
 * all connected sockets, keeping notifications scoped to the relevant users.
 */

import { Server } from 'socket.io';

/**
 * Module-level reference to the Socket.IO server instance.
 * Starts as null and is assigned by `initSocket`.
 * @type {import('socket.io').Server | null}
 */
let io = null;

/**
 * Initialise the Socket.IO server and attach it to an existing HTTP server.
 *
 * Must be called exactly once, before the HTTP server begins listening, so
 * that Socket.IO can intercept the upgrade handshake for WebSocket connections.
 *
 * @param {import('http').Server} httpServer - The Node.js HTTP server created
 *   in index.js that Express is also attached to.
 * @returns {import('socket.io').Server} The newly created Socket.IO server
 *   instance (also stored in the module-level `io` variable).
 */
export const initSocket = (httpServer) => {
  // Create a new Socket.IO server, sharing the HTTP server's port.
  io = new Server(httpServer, {
    cors: {
      // Allow the configured frontend origin to open WebSocket connections.
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      credentials: true,
    },
    // Prefer the native WebSocket transport; fall back to HTTP long-polling
    // for environments where WebSocket upgrades are blocked (some proxies).
    transports: ['websocket', 'polling'],
  });

  // Register handlers for each new client connection.
  io.on('connection', (socket) => {

    /**
     * 'join' event — add this socket to a named room.
     * Clients emit this after connecting to subscribe to updates for a
     * specific entity (e.g. a ticket, a department, or their own user ID).
     *
     * @param {{ room: string }} payload - Object containing the room name.
     */
    socket.on('join', ({ room }) => {
      // Guard against empty / undefined room names to avoid silent errors.
      if (room) socket.join(room);
    });

    /**
     * 'leave' event — remove this socket from a named room.
     * Clients emit this when they navigate away from a view that was
     * previously subscribed to real-time updates.
     *
     * @param {{ room: string }} payload - Object containing the room name.
     */
    socket.on('leave', ({ room }) => {
      // Guard against empty / undefined room names.
      if (room) socket.leave(room);
    });
  });

  return io;
};

/**
 * Return the active Socket.IO server instance.
 *
 * Route handlers and service functions use this to emit events to specific
 * rooms without needing to import the `io` variable directly.
 *
 * @returns {import('socket.io').Server | null} The Socket.IO server, or null
 *   if `initSocket` has not been called yet.
 */
export const getIO = () => io;
