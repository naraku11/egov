/**
 * contexts/SocketContext.jsx
 *
 * Manages the lifecycle of the shared Socket.IO connection and exposes it to
 * the component tree via React Context.
 *
 * Lifecycle rules:
 *   - The socket connects as soon as the user is authenticated and
 *     immediately disconnects when the session ends (logout or token
 *     expiry).  This prevents unauthenticated WebSocket connections.
 *   - After a successful connection the provider emits "join" events to
 *     subscribe the socket to the private rooms the current principal owns:
 *       • Citizens  → "user:<id>"   (personal notifications)
 *       • Admins    → also "admin"  (system-wide admin broadcast room)
 *       • Servants  → "servant:<id>" (assignment and status notifications)
 *   - The effect re-runs whenever `isAuthenticated`, `user.id`, or
 *     `servant.id` changes, so room memberships are always accurate after
 *     a re-login with a different account.
 *
 * Exports:
 *   SocketProvider – context provider; must be placed inside <AuthProvider>.
 *   useSocket      – hook that returns the raw socket.io-client instance.
 */

import { createContext, useContext, useEffect } from 'react';
import socket from '../lib/socket.js';       // singleton Socket.IO client
import { useAuth } from './AuthContext.jsx'; // auth state drives connect/disconnect

/**
 * The context value is the socket instance itself (not a wrapper object), so
 * consumers can call socket.on / socket.emit / socket.off directly.
 *
 * The socket is used as the default value so useSocket() works even outside
 * the provider tree (e.g. in tests), though in that case the socket is
 * not connected.
 */
const SocketContext = createContext(socket);

/**
 * Connects or disconnects the shared socket in response to auth state changes
 * and joins the appropriate private rooms after each connection.
 *
 * @param {{ children: React.ReactNode }} props
 * @returns {React.ReactElement}
 */
export const SocketProvider = ({ children }) => {
  const { user, servant, isAuthenticated } = useAuth();

  useEffect(() => {
    // Disconnect the socket when the user logs out or is unauthenticated
    if (!isAuthenticated) {
      socket.disconnect();
      return;
    }

    // Establish (or re-establish) the WebSocket connection
    socket.connect();

    /**
     * Called every time the socket successfully connects.
     * Emits "join" events to register the client in its private rooms so the
     * server can target push notifications at the right principal.
     */
    const onConnect = () => {
      if (user) {
        // Every citizen subscribes to their own personal notification room
        socket.emit('join', { room: `user:${user.id}` });

        // Admins additionally subscribe to the global admin broadcast room
        if (user.role === 'ADMIN') socket.emit('join', { room: 'admin' });
      }
      if (servant) {
        // Servants subscribe to their personal assignment/notification room
        socket.emit('join', { room: `servant:${servant.id}` });
      }
    };

    // Register the handler for future connect events
    socket.on('connect', onConnect);

    // Re-join rooms if already connected (e.g. hot-reload)
    // This handles the edge case where the socket connected before the effect
    // ran (e.g. React Fast Refresh in development).
    if (socket.connected) onConnect();

    // Cleanup: remove the listener and disconnect when the effect re-runs or
    // the component unmounts (e.g. the user logs out and the provider unmounts)
    return () => {
      socket.off('connect', onConnect);
      socket.disconnect();
    };
  }, [isAuthenticated, user?.id, servant?.id]); // re-run when auth identity changes

  return (
    // Provide the raw socket instance — consumers call socket.on/emit directly
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

/**
 * Hook to access the shared Socket.IO client instance.
 *
 * @returns {import('socket.io-client').Socket} The connected socket instance.
 */
export const useSocket = () => useContext(SocketContext);
