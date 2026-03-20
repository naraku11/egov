import { io } from 'socket.io-client';

// In production, the socket connects to the same origin (Express serves frontend).
// In development, Vite proxies /socket.io to localhost:5000.
const socket = io({
  autoConnect: false,
  transports: ['websocket', 'polling'],
});

export default socket;
