const Room = require('../models/Room');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> Room object
    this.userRoomMap = new Map(); // userId -> roomId
    
    // Cleanup empty rooms every 5 minutes
    setInterval(() => this.cleanupEmptyRooms(), 5 * 60 * 1000);
  }

  // Create new room
  createRoom(createdBy = null, settings = {}) {
    const roomId = uuidv4();
    const room = new Room(roomId, createdBy);
    
    // Apply custom settings
    if (settings.maxUsers) room.maxUsers = Math.min(settings.maxUsers, 50);
    if (settings.requirePassword) {
      room.settings.requirePassword = true;
      room.settings.password = settings.password;
    }
    
    this.rooms.set(roomId, room);
    logger.info(`Room created: ${roomId} by ${createdBy || 'anonymous'}`);
    
    return room;
  }

  // Get room by ID
  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  // Join user to room
  joinRoom(roomId, userId, userInfo, password = null) {
    const room = this.getRoom(roomId);
    
    if (!room) {
      throw new Error('Room not found');
    }
    
    if (!room.isActive) {
      throw new Error('Room is not active');
    }
    
    if (!room.validatePassword(password)) {
      throw new Error('Invalid room password');
    }
    
    // Remove user from previous room if exists
    this.leaveRoom(userId);
    
    const user = room.addUser(userId, userInfo);
    this.userRoomMap.set(userId, roomId);
    
    logger.info(`User ${userId} joined room ${roomId}`);
    return { room, user };
  }

  // Leave room
  leaveRoom(userId) {
    const roomId = this.userRoomMap.get(userId);
    if (!roomId) return null;
    
    const room = this.getRoom(roomId);
    if (!room) return null;
    
    const user = room.removeUser(userId);
    this.userRoomMap.delete(userId);
    
    logger.info(`User ${userId} left room ${roomId}`);
    
    // Clean up empty room
    if (room.isEmpty()) {
      this.rooms.delete(roomId);
      logger.info(`Room ${roomId} deleted (empty)`);
    }
    
    return { room, user };
  }

  // Get user's current room
  getUserRoom(userId) {
    const roomId = this.userRoomMap.get(userId);
    return roomId ? this.getRoom(roomId) : null;
  }

  // Get room by socket ID
  getRoomBySocketId(socketId) {
    for (const room of this.rooms.values()) {
      const user = room.getUserBySocketId(socketId);
      if (user) return room;
    }
    return null;
  }

  // Update user media
  updateUserMedia(userId, mediaType, enabled) {
    const room = this.getUserRoom(userId);
    if (room) {
      return room.updateUserMedia(userId, mediaType, enabled);
    }
    return null;
  }

  // Get all active rooms (for admin)
  getAllRooms() {
    return Array.from(this.rooms.values()).map(room => room.getRoomInfo());
  }

  // Cleanup empty rooms
  cleanupEmptyRooms() {
    const emptyRooms = [];
    
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.isEmpty()) {
        emptyRooms.push(roomId);
      }
    }
    
    emptyRooms.forEach(roomId => {
      this.rooms.delete(roomId);
      logger.info(`Cleaned up empty room: ${roomId}`);
    });
    
    if (emptyRooms.length > 0) {
      logger.info(`Cleaned up ${emptyRooms.length} empty rooms`);
    }
  }

  // Get statistics
  getStats() {
    return {
      totalRooms: this.rooms.size,
      totalUsers: this.userRoomMap.size,
      roomDetails: Array.from(this.rooms.values()).map(room => ({
        roomId: room.roomId,
        userCount: room.users.size,
        createdAt: room.createdAt
      }))
    };
  }
}

// Singleton instance
const roomManager = new RoomManager();
module.exports = roomManager;