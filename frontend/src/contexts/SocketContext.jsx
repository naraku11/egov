import { createContext, useContext, useEffect } from 'react';
import socket from '../lib/socket.js';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext(socket);

export const SocketProvider = ({ children }) => {
  const { user, servant, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      socket.disconnect();
      return;
    }

    socket.connect();

    const onConnect = () => {
      if (user) {
        socket.emit('join', { room: `user:${user.id}` });
        if (user.role === 'ADMIN') socket.emit('join', { room: 'admin' });
      }
      if (servant) {
        socket.emit('join', { room: `servant:${servant.id}` });
      }
    };

    socket.on('connect', onConnect);
    // Re-join rooms if already connected (e.g. hot-reload)
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.disconnect();
    };
  }, [isAuthenticated, user?.id, servant?.id]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
