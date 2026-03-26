import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

const port = Number(process.env.NOTIFICATION_SERVICE_PORT || 8050);
const corsOrigin = process.env.NOTIFICATION_CORS_ORIGIN || '*';

const app = express();
app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin }));
app.use(express.json({ limit: '2mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigin === '*' ? true : corsOrigin,
  },
});

io.on('connection', (socket) => {
  console.log(`[notification-service] client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[notification-service] client disconnected: ${socket.id}`);
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'notification-service' });
});

app.post('/events', (req, res) => {
  const eventName = String(req.body?.eventName || '').trim();
  const payload = req.body?.payload ?? {};

  if (!eventName) {
    return res.status(400).json({ message: 'eventName e obrigatorio' });
  }

  io.emit(eventName, payload);
  return res.status(202).json({ success: true, eventName });
});

server.listen(port, () => {
  console.log(`notification-service listening on :${port}`);
});

