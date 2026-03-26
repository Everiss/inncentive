import { io } from 'socket.io-client';

const socketBaseUrl = import.meta.env.VITE_NOTIFICATION_BASE_URL || 'http://localhost:8050';
export const socket = io(socketBaseUrl, { autoConnect: true });
