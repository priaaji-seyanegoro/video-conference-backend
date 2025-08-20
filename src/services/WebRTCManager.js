const logger = require('../utils/logger');

class WebRTCManager {
  constructor() {
    this.connections = new Map(); // roomId -> Map(userId -> connections)
    this.pendingOffers = new Map(); // connectionId -> offer data
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ];
  }

  // Initialize room connections
  initializeRoom(roomId) {
    if (!this.connections.has(roomId)) {
      this.connections.set(roomId, new Map());
      logger.info(`WebRTC connections initialized for room: ${roomId}`);
    }
  }

  // Add user to room
  addUser(roomId, userId, socketId) {
    this.initializeRoom(roomId);
    const roomConnections = this.connections.get(roomId);
    
    if (!roomConnections.has(userId)) {
      roomConnections.set(userId, {
        socketId,
        peers: new Map(), // peerId -> connection info
        isInitiator: false,
        mediaState: {
          audio: true,
          video: true,
          screen: false
        }
      });
      
      logger.info(`User ${userId} added to WebRTC room ${roomId}`);
    }
    
    return roomConnections.get(userId);
  }

  // Remove user from room
  removeUser(roomId, userId) {
    const roomConnections = this.connections.get(roomId);
    if (roomConnections && roomConnections.has(userId)) {
      const userConnections = roomConnections.get(userId);
      
      // Clean up all peer connections for this user
      userConnections.peers.clear();
      roomConnections.delete(userId);
      
      // Clean up room if empty
      if (roomConnections.size === 0) {
        this.connections.delete(roomId);
        logger.info(`WebRTC room ${roomId} cleaned up (empty)`);
      }
      
      logger.info(`User ${userId} removed from WebRTC room ${roomId}`);
      return true;
    }
    return false;
  }

  // Create peer connection between two users
  createPeerConnection(roomId, fromUserId, toUserId) {
    const roomConnections = this.connections.get(roomId);
    if (!roomConnections) return null;
    
    const fromUser = roomConnections.get(fromUserId);
    const toUser = roomConnections.get(toUserId);
    
    if (!fromUser || !toUser) return null;
    
    const connectionId = `${fromUserId}-${toUserId}`;
    
    // Store connection info
    fromUser.peers.set(toUserId, {
      connectionId,
      peerId: toUserId,
      status: 'connecting',
      createdAt: new Date()
    });
    
    logger.info(`Peer connection created: ${connectionId} in room ${roomId}`);
    return connectionId;
  }

  // Handle offer
  handleOffer(roomId, fromUserId, toUserId, offer) {
    const connectionId = this.createPeerConnection(roomId, fromUserId, toUserId);
    
    if (connectionId) {
      this.pendingOffers.set(connectionId, {
        roomId,
        fromUserId,
        toUserId,
        offer,
        timestamp: new Date()
      });
      
      logger.info(`Offer stored for connection: ${connectionId}`);
      return connectionId;
    }
    
    return null;
  }

  // Handle answer
  handleAnswer(roomId, fromUserId, toUserId, answer) {
    const connectionId = `${toUserId}-${fromUserId}`; // Reverse for answer
    const roomConnections = this.connections.get(roomId);
    
    if (roomConnections) {
      const fromUser = roomConnections.get(fromUserId);
      if (fromUser && fromUser.peers.has(toUserId)) {
        fromUser.peers.get(toUserId).status = 'connected';
        logger.info(`Answer processed for connection: ${connectionId}`);
        return true;
      }
    }
    
    return false;
  }

  // Update media state
  updateMediaState(roomId, userId, mediaType, enabled) {
    const roomConnections = this.connections.get(roomId);
    if (roomConnections && roomConnections.has(userId)) {
      const user = roomConnections.get(userId);
      const previousState = { ...user.mediaState };
      user.mediaState[mediaType] = enabled;
      
      // Logging yang lebih detail
      logger.info(`Media state updated for ${userId}: ${mediaType} changed from ${previousState[mediaType]} to ${enabled}`);
      logger.info(`Full media state for ${userId}:`, JSON.stringify(user.mediaState, null, 2));
      
      return user.mediaState;
    }
    
    logger.error(`Failed to update media state for ${userId} in room ${roomId}: User not found`);
    return null;
  }

  // Get room connections info
  getRoomConnections(roomId) {
    const roomConnections = this.connections.get(roomId);
    if (!roomConnections) return null;
    
    const result = {
      roomId,
      userCount: roomConnections.size,
      users: {},
      totalConnections: 0
    };
    
    for (const [userId, userInfo] of roomConnections.entries()) {
      result.users[userId] = {
        socketId: userInfo.socketId,
        peerCount: userInfo.peers.size,
        mediaState: userInfo.mediaState,
        peers: Array.from(userInfo.peers.keys())
      };
      result.totalConnections += userInfo.peers.size;
    }
    
    return result;
  }

  // Get ICE servers configuration
  getIceServers() {
    return this.iceServers;
  }

  // Clean up old pending offers (older than 30 seconds)
  cleanupPendingOffers() {
    const now = new Date();
    const expiredOffers = [];
    
    for (const [connectionId, offerData] of this.pendingOffers.entries()) {
      if (now - offerData.timestamp > 30000) { // 30 seconds
        expiredOffers.push(connectionId);
      }
    }
    
    expiredOffers.forEach(connectionId => {
      this.pendingOffers.delete(connectionId);
      logger.info(`Expired offer cleaned up: ${connectionId}`);
    });
    
    return expiredOffers.length;
  }

  // Get statistics
  getStats() {
    const stats = {
      totalRooms: this.connections.size,
      totalUsers: 0,
      totalConnections: 0,
      pendingOffers: this.pendingOffers.size,
      rooms: {}
    };
    
    for (const [roomId, roomConnections] of this.connections.entries()) {
      stats.totalUsers += roomConnections.size;
      
      let roomConnectionCount = 0;
      for (const userInfo of roomConnections.values()) {
        roomConnectionCount += userInfo.peers.size;
      }
      
      stats.totalConnections += roomConnectionCount;
      stats.rooms[roomId] = {
        userCount: roomConnections.size,
        connectionCount: roomConnectionCount
      };
    }
    
    return stats;
  }
}

// Singleton instance
const webRTCManager = new WebRTCManager();

// Cleanup expired offers every minute
setInterval(() => {
  webRTCManager.cleanupPendingOffers();
}, 60000);

module.exports = webRTCManager;