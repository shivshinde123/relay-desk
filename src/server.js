require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { verifyToken } = require('./middleware/auth');
const slaMonitor = require('./jobs/slaMonitor');

const server = http.createServer(app);
const origins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
const io = new Server(server, { cors: { origin: origins.length ? origins : false } });
app.set('io', io);

// Sockets must present the same JWT as the REST API.
io.use((socket, next) => {
  try {
    const p = verifyToken(socket.handshake.auth?.token || '');
    socket.user = { id: p.sub, role: p.role };
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});
io.on('connection', (socket) => {
  if (socket.user.role === 'agent' || socket.user.role === 'admin') socket.join('staff');
  socket.join(`user:${socket.user.id}`);
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => {
  console.log(`Support desk running on http://localhost:${port}`);
  slaMonitor.start(io);
});
