const roomManager = require('../services/RoomManager');
const webRTCManager = require('../services/WebRTCManager');
const logger = require('../utils/logger');

function handleSocketConnection(io, socket) {
  logger.info(`New client connected: ${socket.id}`);

  // Join room with WebRTC initialization
  // Ganti line 8-15:
  socket.on('join-room', async (data) => {
    console.log('Raw join-room data:', JSON.stringify(data, null, 2));
    console.log('Data type:', typeof data);
    try {
      console.log('Received join-room data:', data); // Debug log
      
      const { roomId, userName, password } = data;
      
      if (!roomId || !userName) {
        throw new Error('Missing required fields: roomId or userName');
      }
      
      const userId = socket.id; // Use socket.id as userId
      
      const userInfo = {
        name: userName,
        isAudioEnabled: false,
        isVideoEnabled: false,
        isScreenSharing: false,
        isHost: false,
        isHandRaised: false
      };
  
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

  // Chat functionality
  socket.on('send-message', (messageData) => {
    if (socket.userId && socket.roomId) {
      const room = roomManager.getRoom(socket.roomId);
      if (room) {
        const user = room.users.get(socket.userId);
        if (user) {
          const message = {
            id: require('uuid').v4(),
            userId: socket.userId,
            userName: user.name,
            message: messageData.message,
            timestamp: new Date(),
            type: messageData.type || 'text' // text, file, emoji
          };
          
          // Broadcast message to all users in room
          io.to(socket.roomId).emit('new-message', message);
          
          logger.info(`Message sent in room ${socket.roomId} by ${socket.userId}`);
        }
      }
    }
  });

  // File sharing
  socket.on('share-file', (fileData) => {
    if (socket.userId && socket.roomId) {
      const room = roomManager.getRoom(socket.roomId);
      if (room) {
        const user = room.users.get(socket.userId);
        if (user) {
          const fileMessage = {
            id: require('uuid').v4(),
            userId: socket.userId,
            userName: user.name,
            fileName: fileData.fileName,
            fileSize: fileData.fileSize,
            fileType: fileData.fileType,
            fileUrl: fileData.fileUrl,
            timestamp: new Date(),
            type: 'file'
          };
          
          // Broadcast file to all users in room
          io.to(socket.roomId).emit('new-file', fileMessage);
          
          logger.info(`File shared in room ${socket.roomId} by ${socket.userId}: ${fileData.fileName}`);
        }
      }
    }
  });

  // Screen sharing with stream management
  socket.on('start-screen-share', (streamData) => {
    if (socket.userId && socket.roomId) {
      const user = roomManager.updateUserMedia(socket.userId, 'screen', true);
      const mediaState = webRTCManager.updateMediaState(
        socket.roomId, 
        socket.userId, 
        'screen', 
        true
      );
      
      if (user && mediaState) {
        socket.to(socket.roomId).emit('user-started-screen-share', {
          userId: socket.userId,
          userName: user.name,
          streamId: streamData.streamId,
          mediaState,
          user
        });
        
        logger.info(`Screen sharing started by ${socket.userId} in room ${socket.roomId}`);
      }
    }
  });

  socket.on('stop-screen-share', () => {
    if (socket.userId && socket.roomId) {
      const user = roomManager.updateUserMedia(socket.userId, 'screen', false);
      const mediaState = webRTCManager.updateMediaState(
        socket.roomId, 
        socket.userId, 
        'screen', 
        false
      );
      
      if (user && mediaState) {
        socket.to(socket.roomId).emit('user-stopped-screen-share', {
          userId: socket.userId,
          userName: user.name,
          mediaState,
          user
        });
        
        logger.info(`Screen sharing stopped by ${socket.userId} in room ${socket.roomId}`);
      }
    }
  });

  // Recording functionality
  socket.on('start-recording', () => {
    if (socket.userId && socket.roomId) {
      const room = roomManager.getRoom(socket.roomId);
      if (room) {
        const user = room.users.get(socket.userId);
        if (user && user.role === 'host') {
          room.settings.recordingEnabled = true;
          
          socket.to(socket.roomId).emit('recording-started', {
            startedBy: socket.userId,
            userName: user.name,
            timestamp: new Date()
          });
          
          logger.info(`Recording started in room ${socket.roomId} by ${socket.userId}`);
        } else {
          socket.emit('error', {
            type: 'recording-permission-denied',
            message: 'Only host can start recording'
          });
        }
      }
    }
  });

  socket.on('stop-recording', () => {
    if (socket.userId && socket.roomId) {
      const room = roomManager.getRoom(socket.roomId);
      if (room) {
        const user = room.users.get(socket.userId);
        if (user && user.role === 'host') {
          room.settings.recordingEnabled = false;
          
          socket.to(socket.roomId).emit('recording-stopped', {
            stoppedBy: socket.userId,
            userName: user.name,
            timestamp: new Date()
          });
          
          logger.info(`Recording stopped in room ${socket.roomId} by ${socket.userId}`);
        }
      }
    }
  });

  // Participant management (host only)
  socket.on('mute-participant', (targetUserId) => {
    if (socket.userId && socket.roomId) {
      const room = roomManager.getRoom(socket.roomId);
      if (room) {
        const host = room.users.get(socket.userId);
        const targetUser = room.users.get(targetUserId);
        
        if (host && host.role === 'host' && targetUser) {
          // Force mute target user
          roomManager.updateUserMedia(targetUserId, 'audio', false);
          webRTCManager.updateMediaState(socket.roomId, targetUserId, 'audio', false);
          
          io.to(socket.roomId).emit('participant-muted', {
            targetUserId,
            targetUserName: targetUser.name,
            mutedBy: socket.userId,
            mutedByName: host.name
          });
          
          logger.info(`User ${targetUserId} muted by host ${socket.userId} in room ${socket.roomId}`);
        }
      }
    }
  });

  socket.on('remove-participant', (targetUserId) => {
    if (socket.userId && socket.roomId) {
      const room = roomManager.getRoom(socket.roomId);
      if (room) {
        const host = room.users.get(socket.userId);
        const targetUser = room.users.get(targetUserId);
        
        if (host && host.role === 'host' && targetUser) {
          // Find target socket and disconnect
          const targetSocket = Array.from(io.sockets.sockets.values())
            .find(s => s.userId === targetUserId && s.roomId === socket.roomId);
          
          if (targetSocket) {
            targetSocket.emit('removed-from-room', {
              removedBy: socket.userId,
              removedByName: host.name,
              reason: 'Removed by host'
            });
            
            handleUserLeave(targetSocket, io);
            targetSocket.disconnect();
            
            logger.info(`User ${targetUserId} removed by host ${socket.userId} from room ${socket.roomId}`);
          }
        }
      }
    }
  });

  // Raise hand functionality
  socket.on('raise-hand', (raised) => {
    if (socket.userId && socket.roomId) {
      const room = roomManager.getRoom(socket.roomId);
      if (room) {
        const user = room.users.get(socket.userId);
        if (user) {
          user.handRaised = raised;
          
          socket.to(socket.roomId).emit('hand-raised', {
            userId: socket.userId,
            userName: user.name,
            raised,
            timestamp: new Date()
          });
          
          logger.info(`Hand ${raised ? 'raised' : 'lowered'} by ${socket.userId} in room ${socket.roomId}`);
        }
      }
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