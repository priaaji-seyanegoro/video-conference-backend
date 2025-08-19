const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const roomManager = require('./services/RoomManager');
const webRTCManager = require('./services/WebRTCManager');

// Import handlers
const { handleSocketConnection } = require('./handlers/socketHandler');
const logger = require('./utils/logger');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  methods: ["GET", "POST"],
  credentials: true
}));

// Socket.io setup
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Basic routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Video Conference Backend API',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

// Enhanced room creation endpoint
app.post('/api/rooms', (req, res) => {
  try {
    const { createdBy, settings } = req.body;
    const room = roomManager.createRoom(createdBy, settings);
    
    res.json({
      roomId: room.roomId,
      message: 'Room created successfully',
      roomInfo: room.getRoomInfo()
    });
  } catch (error) {
    logger.error('Failed to create room:', error.message);
    res.status(500).json({
      error: 'Failed to create room',
      message: error.message
    });
  }
});

// Get room info
app.get('/api/rooms/:roomId', (req, res) => {
  try {
    const room = roomManager.getRoom(req.params.roomId);
    
    if (!room) {
      return res.status(404).json({
        error: 'Room not found'
      });
    }
    
    res.json(room.getRoomInfo());
  } catch (error) {
    logger.error('Failed to get room info:', error.message);
    res.status(500).json({
      error: 'Failed to get room info',
      message: error.message
    });
  }
});

// Get server stats
app.get('/api/stats', (req, res) => {
  try {
    const stats = roomManager.getStats();
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get stats:', error.message);
    res.status(500).json({
      error: 'Failed to get stats',
      message: error.message
    });
  }
});

// Get WebRTC statistics
app.get('/api/webrtc/stats', (req, res) => {
  try {
    const stats = webRTCManager.getStats();
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get WebRTC stats:', error.message);
    res.status(500).json({
      error: 'Failed to get WebRTC stats',
      message: error.message
    });
  }
});

// Get room WebRTC connections
app.get('/api/webrtc/rooms/:roomId', (req, res) => {
  try {
    const connections = webRTCManager.getRoomConnections(req.params.roomId);
    
    if (!connections) {
      return res.status(404).json({
        error: 'Room not found in WebRTC manager'
      });
    }
    
    res.json(connections);
  } catch (error) {
    logger.error('Failed to get room connections:', error.message);
    res.status(500).json({
      error: 'Failed to get room connections',
      message: error.message
    });
  }
});

// Get ICE servers configuration
app.get('/api/webrtc/ice-servers', (req, res) => {
  try {
    const iceServers = webRTCManager.getIceServers();
    res.json({ iceServers });
  } catch (error) {
    logger.error('Failed to get ICE servers:', error.message);
    res.status(500).json({
      error: 'Failed to get ICE servers',
      message: error.message
    });
  }
});

// Socket connection handling
io.on('connection', (socket) => {
  logger.info(`User connected: ${socket.id}`);
  handleSocketConnection(io, socket);
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Ganti dari port 5000 ke port lain
const PORT = process.env.PORT || 5001; // atau 3001, 8000, dll
server.listen(PORT, () => {
  logger.info(`🚀 Backend server running on http://localhost:${PORT}`);
  logger.info(`📡 Socket.io server ready for connections`);
});

module.exports = { app, server, io };