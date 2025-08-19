const roomManager = require('../services/RoomManager');
const webRTCManager = require('../services/WebRTCManager');
const logger = require('../utils/logger');

function handleSocketConnection(io, socket) {
  logger.info(`New client connected: ${socket.id}`);

  // Join room with WebRTC initialization
  socket.on('join-room', async (roomId, userId, userInfo, password) => {
    try {
      const { room, user } = roomManager.joinRoom(roomId, userId, {
        ...userInfo,
        socketId: socket.id
      }, password);

      // Initialize WebRTC for this user
      webRTCManager.addUser(roomId, userId, socket.id);

      // Join socket room
      socket.join(roomId);
      socket.userId = userId;
      socket.roomId = roomId;

      // Get existing users in room for peer connections
      const existingUsers = Array.from(room.users.values())
        .filter(u => u.userId !== userId)
        .map(u => ({
          userId: u.userId,
          name: u.name,
          mediaState: {
            audio: u.isAudioEnabled,
            video: u.isVideoEnabled,
            screen: u.isScreenSharing
          }
        }));

      // Notify user of successful join with existing users
      socket.emit('room-joined', {
        roomId,
        userId,
        user,
        roomInfo: room.getRoomInfo(),
        existingUsers,
        iceServers: webRTCManager.getIceServers()
      });

      // Notify other users in room
      socket.to(roomId).emit('user-connected', {
        userId,
        user,
        roomInfo: room.getRoomInfo()
      });

      logger.info(`User ${userId} successfully joined room ${roomId}`);
    } catch (error) {
      logger.error(`Failed to join room: ${error.message}`);
      socket.emit('error', {
        type: 'join-room-failed',
        message: error.message
      });
    }
  });

  // Enhanced WebRTC Signaling
  socket.on('offer', (data) => {
    try {
      const { target, offer } = data;
      
      if (!socket.userId || !socket.roomId) {
        throw new Error('User not in room');
      }
      
      // Handle offer through WebRTC manager
      const connectionId = webRTCManager.handleOffer(
        socket.roomId, 
        socket.userId, 
        target, 
        offer
      );
      
      if (connectionId) {
        // Forward offer to target user
        socket.to(socket.roomId).emit('offer', {
          offer,
          sender: socket.userId,
          target,
          connectionId
        });
        
        logger.info(`Offer forwarded: ${socket.userId} -> ${target}`);
      } else {
        socket.emit('error', {
          type: 'offer-failed',
          message: 'Failed to process offer'
        });
      }
    } catch (error) {
      logger.error(`Offer error: ${error.message}`);
      socket.emit('error', {
        type: 'offer-error',
        message: error.message
      });
    }
  });

  socket.on('answer', (data) => {
    try {
      const { target, answer } = data;
      
      if (!socket.userId || !socket.roomId) {
        throw new Error('User not in room');
      }
      
      // Handle answer through WebRTC manager
      const success = webRTCManager.handleAnswer(
        socket.roomId,
        socket.userId,
        target,
        answer
      );
      
      if (success) {
        // Forward answer to target user
        socket.to(socket.roomId).emit('answer', {
          answer,
          sender: socket.userId,
          target
        });
        
        logger.info(`Answer forwarded: ${socket.userId} -> ${target}`);
      } else {
        socket.emit('error', {
          type: 'answer-failed',
          message: 'Failed to process answer'
        });
      }
    } catch (error) {
      logger.error(`Answer error: ${error.message}`);
      socket.emit('error', {
        type: 'answer-error',
        message: error.message
      });
    }
  });

  socket.on('ice-candidate', (data) => {
    try {
      const { target, candidate } = data;
      
      if (!socket.userId || !socket.roomId) {
        throw new Error('User not in room');
      }
      
      // Forward ICE candidate to target user
      socket.to(socket.roomId).emit('ice-candidate', {
        candidate,
        sender: socket.userId,
        target
      });
      
      logger.info(`ICE candidate forwarded: ${socket.userId} -> ${target}`);
    } catch (error) {
      logger.error(`ICE candidate error: ${error.message}`);
      socket.emit('error', {
        type: 'ice-candidate-error',
        message: error.message
      });
    }
  });

  // Enhanced Media Controls
  socket.on('toggle-audio', (enabled) => {
    if (socket.userId && socket.roomId) {
      // Update room manager
      const user = roomManager.updateUserMedia(socket.userId, 'audio', enabled);
      
      // Update WebRTC manager
      const mediaState = webRTCManager.updateMediaState(
        socket.roomId, 
        socket.userId, 
        'audio', 
        enabled
      );
      
      if (user && mediaState) {
        socket.to(socket.roomId).emit('user-media-changed', {
          userId: socket.userId,
          mediaType: 'audio',
          enabled,
          mediaState,
          user
        });
      }
    }
  });

  socket.on('toggle-video', (enabled) => {
    if (socket.userId && socket.roomId) {
      const user = roomManager.updateUserMedia(socket.userId, 'video', enabled);
      const mediaState = webRTCManager.updateMediaState(
        socket.roomId, 
        socket.userId, 
        'video', 
        enabled
      );
      
      if (user && mediaState) {
        socket.to(socket.roomId).emit('user-media-changed', {
          userId: socket.userId,
          mediaType: 'video',
          enabled,
          mediaState,
          user
        });
      }
    }
  });

  socket.on('toggle-screen-share', (enabled) => {
    if (socket.userId && socket.roomId) {
      const user = roomManager.updateUserMedia(socket.userId, 'screen', enabled);
      const mediaState = webRTCManager.updateMediaState(
        socket.roomId, 
        socket.userId, 
        'screen', 
        enabled
      );
      
      if (user && mediaState) {
        socket.to(socket.roomId).emit('user-media-changed', {
          userId: socket.userId,
          mediaType: 'screen',
          enabled,
          mediaState,
          user
        });
      }
    }
  });

  // Connection quality monitoring
  socket.on('connection-quality', (data) => {
    if (socket.userId && socket.roomId) {
      socket.to(socket.roomId).emit('user-connection-quality', {
        userId: socket.userId,
        quality: data.quality,
        stats: data.stats
      });
    }
  });

  // Leave room
  socket.on('leave-room', () => {
    handleUserLeave(socket, io);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    handleUserLeave(socket, io);
    logger.info(`Client disconnected: ${socket.id}`);
  });
}

function handleUserLeave(socket, io) {
  if (socket.userId && socket.roomId) {
    // Remove from room manager
    const result = roomManager.leaveRoom(socket.userId);
    
    // Remove from WebRTC manager
    webRTCManager.removeUser(socket.roomId, socket.userId);
    
    if (result && result.room) {
      // Notify other users
      socket.to(socket.roomId).emit('user-disconnected', {
        userId: socket.userId,
        user: result.user,
        roomInfo: result.room.getRoomInfo()
      });
      
      socket.leave(socket.roomId);
    }
  }
}

module.exports = { handleSocketConnection };