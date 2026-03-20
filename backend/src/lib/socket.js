import { Server } from 'socket.io';

let io = null;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    socket.on('join', ({ room }) => {
      if (room) socket.join(room);
    });

    socket.on('leave', ({ room }) => {
      if (room) socket.leave(room);
    });
  });

  return io;
};

export const getIO = () => io;
